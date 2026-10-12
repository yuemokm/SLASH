import { test } from "node:test";
import assert from "node:assert/strict";
import type { Message, Run } from "../shared/types";
import { runOutputMessageIndices } from "../src/run-output-placement";
import { runHistoryAnchors } from "../src/run-history-anchors";

const time = "2026-10-09T01:00:00.000Z";
const message = (role: Message["role"], runId?: string): Message => ({role, runId, time, text:"合成消息"});
test("outputs follow the last assistant of their own Run, regardless of filename or later messages", () => {
  const messages = [message("user"),message("assistant","old"),message("assistant","edited"),message("tool","old"),message("assistant","edited"),message("user"),message("assistant")];
  assert.deepEqual([...runOutputMessageIndices(messages)], [["old",1],["edited",4]]);
  assert.equal(messages[1].runId,"old");
});
test("persisted partial replies do not duplicate live Run output", () => {
  const messages = [message("assistant","old"),message("assistant","active"),message("assistant","active")];
  assert.deepEqual([...runOutputMessageIndices(messages,"active")], [["old",0]]);
  assert.deepEqual([...runOutputMessageIndices(messages)], [["old",0],["active",2]]);
});
test("an orphan completed Run with output keeps a historical entry; other Runs stay filtered", () => {
  const orphan: Run = {id:"orphan",conversationId:"c",startedAt:time,status:"succeeded"};
  const ordinary: Run = {...orphan,id:"ordinary"};
  const messages = [message("user"),{...message("user"),time:"2026-10-09T02:00:00.000Z"}];
  assert.deepEqual([...runHistoryAnchors(messages,[ordinary,orphan],{outputRunIds:["orphan"]})],[[1,[orphan]]]);
  assert.equal(runHistoryAnchors(messages,[orphan],{activeRunId:"orphan",outputRunIds:["orphan"]}).size,0);
});
