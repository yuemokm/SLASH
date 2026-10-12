import React from "react";
import {
  AbsoluteFill,
  Composition,
  Img,
  Series,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { BasicCaptions } from "./BasicCaptions";
import { timings, voiceReady } from "./timeline";

const paper = "#f4f1ea";
const ink = "#292720";
const orange = "#be5237";
const font = "Microsoft YaHei, PingFang SC, system-ui, sans-serif";
const timing = (id: string) => {
  const row = timings.find((s) => s.id === id);
  if (!row) throw new Error(`Missing chapter timing: ${id}`);
  return row;
};
const frames = (id: string) => timing(id).frames;
const WithNarration: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const row = timing(id);
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 8, row.frames - 10, row.frames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
      {voiceReady ? <Audio src={staticFile(row.audio)} volume={0.9} /> : null}
      {row.captions.length > 0 ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 24,
              width: 2500,
              transform: "translateX(-50%) scale(.60)",
              transformOrigin: "center bottom",
            }}
          >
            <BasicCaptions
              captions={row.captions}
              width={2500}
              combineTokensWithinMilliseconds={3100}
            />
          </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Header: React.FC<{ title: string; index: string }> = ({
  title,
  index,
}) => (
  <>
    <div
      style={{
        position: "absolute",
        left: 95,
        top: 65,
        fontSize: 24,
        fontWeight: 650,
        letterSpacing: 3,
        color: orange,
      }}
    >
      SLASH
    </div>
    <div
      style={{
        position: "absolute",
        left: 95,
        top: 106,
        fontSize: 43,
        fontWeight: 600,
        color: ink,
      }}
    >
      {title}
    </div>
    <div
      style={{
        position: "absolute",
        right: 100,
        top: 83,
        fontSize: 25,
        color: "#777065",
      }}
    >
      {index} / 10
    </div>
  </>
);

const Screen: React.FC<{ src: string; zoom?: number; origin?: string }> = ({
  src,
  zoom = 1.04,
  origin = "center",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, zoom], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 94,
        top: 178,
        width: 1732,
        height: 710,
        overflow: "hidden",
        borderRadius: 18,
        boxShadow: "0 16px 45px #40382b22",
        border: "1px solid #d6cfc4",
        background: "#fff",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `scale(${scale})`,
          transformOrigin: origin,
        }}
      />
    </div>
  );
};

const CropScreen: React.FC<{
  src: string;
  sourceWidth: number;
  x: number;
  y: number;
  width: number;
  pan?: number;
}> = ({ src, sourceWidth, x, y, width, pan = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const offset = interpolate(frame, [0, durationInFrames], [0, pan], {
    extrapolateRight: "clamp",
  });
  const scale = 1732 / width;
  return (
    <div
      style={{
        position: "absolute",
        left: 94,
        top: 178,
        width: 1732,
        height: 710,
        overflow: "hidden",
        borderRadius: 18,
        boxShadow: "0 16px 45px #40382b22",
        border: "1px solid #d6cfc4",
        background: "#fff",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          position: "absolute",
          width: sourceWidth * scale,
          maxWidth: "none",
          height: "auto",
          left: -x * scale,
          top: -(y + offset) * scale,
        }}
      />
    </div>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: paper, fontFamily: font, color: ink }}>
      <div
        style={{
          position: "absolute",
          left: 98,
          top: 184,
          fontSize: 95,
          fontWeight: 600,
          letterSpacing: -4,
          opacity: reveal,
        }}
      >
        Slash
      </div>
      <div
        style={{
          position: "absolute",
          left: 104,
          top: 323,
          fontSize: 33,
          lineHeight: 1.8,
          color: "#6f685f",
        }}
      >
        面向产品经理的
        <br />
        桌面 Agent
      </div>
      <div
        style={{
          position: "absolute",
          left: 545,
          top: 170,
          width: 1260,
          height: 730,
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 18px 50px #40382b25",
        }}
      >
        <Img
          src={staticFile("screens/01-slash-home.png")}
          style={{
            height: "100%",
            width: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 828,
          fontSize: 24,
          color: orange,
        }}
      >
        资料 · PRD · 交互原型
      </div>
    </AbsoluteFill>
  );
};

const Architecture: React.FC = () => {
  const total = frames("architecture");
  const prefix =
    timing("architecture").prefixFrames ?? Math.min(300, Math.round(total / 4));
  return (
    <AbsoluteFill style={{ background: paper, fontFamily: font, color: ink }}>
      <Sequence durationInFrames={prefix}>
        <AbsoluteFill style={{ background: paper, padding: "185px 115px" }}>
          <div style={{ fontSize: 27, color: orange, letterSpacing: 2 }}>
            PI SDK
          </div>
          <h1 style={{ fontSize: 68, fontWeight: 600, margin: "28px 0 55px" }}>
            复用基础能力，专注产品任务
          </h1>
          <div style={{ fontSize: 35, lineHeight: 2, color: "#6f685f" }}>
            模型适配　·　会话管理　·　工具循环
          </div>
          <div style={{ fontSize: 27, marginTop: 120, color: "#6f685f" }}>
            OpenClaw 早期也用过 Pi
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence
        from={prefix}
        durationInFrames={total - prefix}
        premountFor={30}
      >
        <Video
          src={staticFile("architecture.mp4")}
          muted
          playbackRate={30 / ((total - prefix) / 30)}
          style={{ width: "100%", height: "100%" }}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

const Models: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="模型配置" index="03" />
    <Series>
      <Series.Sequence durationInFrames={Math.round(frames("models") * 0.42)}>
        <Screen
          src="screens/02-model-protocols.png"
          zoom={1.07}
          origin="60% 60%"
        />
      </Series.Sequence>
      <Series.Sequence
        durationInFrames={
          frames("models") - Math.round(frames("models") * 0.42)
        }
      >
        <CropScreen
          src="screens/03-model-connection-fields.png"
          sourceWidth={1922}
          x={480}
          y={265}
          width={1000}
          pan={20}
        />
      </Series.Sequence>
    </Series>
    <div
      style={{
        position: "absolute",
        bottom: 137,
        left: 95,
        fontSize: 25,
        color: "#6f685f",
      }}
    >
      OpenAI Chat Completions · OpenAI Responses · Anthropic Messages
    </div>
  </AbsoluteFill>
);

const Skills: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="导入技能" index="04" />
    <Series>
      <Series.Sequence durationInFrames={Math.round(frames("skills") * 0.4)}>
        <Screen src="screens/04-skills-import.png" />
      </Series.Sequence>
      <Series.Sequence
        durationInFrames={frames("skills") - Math.round(frames("skills") * 0.4)}
      >
        <Screen src="screens/05-skills-local-github.png" />
      </Series.Sequence>
    </Series>
    <div
      style={{
        position: "absolute",
        bottom: 137,
        left: 95,
        fontSize: 25,
        color: "#6f685f",
      }}
    >
      本地文件夹 / GitHub　·　Skill Creator 等外部工具创建后导入
    </div>
  </AbsoluteFill>
);

const Permissions: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="权限与模式" index="05" />
    <Screen src="screens/01-slash-home.png" zoom={1.13} origin="66% 94%" />
    <div
      style={{
        position: "absolute",
        bottom: 137,
        left: 97,
        fontSize: 25,
        color: "#6f685f",
      }}
    >
      Plan：先研究　·　Build：生成与修改　·　完全访问：可访问项目外文件
    </div>
  </AbsoluteFill>
);

const SlashCommands: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="斜杠指令" index="08" />
    <Screen src="screens/08-slash-commands.png" zoom={1.04} origin="55% 65%" />
  </AbsoluteFill>
);

const Sharing: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="共享文件夹" index="06" />
    <Screen src="screens/09-smb-sharing.png" zoom={1.02} />
    <div
      style={{
        position: "absolute",
        bottom: 137,
        right: 97,
        fontSize: 25,
        color: "#6f685f",
      }}
    >
      SMB 共享同一份项目　·　双机协作待验证
    </div>
  </AbsoluteFill>
);

const Resources: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="资料和成果" index="07" />
    <Series>
      <Series.Sequence
        durationInFrames={Math.round(frames("resources") * 0.43)}
      >
        <Screen
          src="screens/11-right-source-files.png"
          zoom={1.03}
          origin="75% 50%"
        />
      </Series.Sequence>
      <Series.Sequence
        durationInFrames={
          frames("resources") - Math.round(frames("resources") * 0.43)
        }
      >
        <Screen
          src="screens/10-right-files-artifacts.png"
          zoom={1.05}
          origin="75% 50%"
        />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

const PrdDemo: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font }}>
    <Header title="试写一份简单 PRD" index="09" />
    <Series>
      <Series.Sequence durationInFrames={Math.round(frames("prd") * 0.2)}>
        <Screen
          src="screens/11-right-source-files.png"
          zoom={1.04}
          origin="75% 55%"
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={Math.round(frames("prd") * 0.3)}>
        <Screen src="screens/12-prd-draft.png" zoom={1.04} origin="60% 50%" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={Math.round(frames("prd") * 0.2)}>
        <Screen src="screens/13-prd-preview.png" zoom={1.04} origin="75% 50%" />
      </Series.Sequence>
      <Series.Sequence
        durationInFrames={
          frames("prd") -
          Math.round(frames("prd") * 0.2) * 2 -
          Math.round(frames("prd") * 0.3)
        }
      >
        <CropScreen
          src="screens/14-prd-final-preview.png"
          sourceWidth={1980}
          x={980}
          y={240}
          width={950}
          pan={55}
        />
      </Series.Sequence>
    </Series>
    <div
      style={{
        position: "absolute",
        bottom: 137,
        left: 97,
        fontSize: 25,
        color: "#6f685f",
      }}
    >
      真实生成的待应用草稿　·　已省略等待过程
    </div>
  </AbsoluteFill>
);
const Closing: React.FC = () => (
  <AbsoluteFill style={{ background: paper, fontFamily: font, color: ink }}>
    <div
      style={{
        position: "absolute",
        left: 110,
        top: 220,
        fontSize: 88,
        fontWeight: 600,
      }}
    >
      Slash
    </div>
    <div style={{ position: "absolute", left: 115, top: 360, fontSize: 43 }}>
      从资料出发，写需求、改原型。
    </div>
    <div
      style={{
        position: "absolute",
        left: 115,
        top: 528,
        fontSize: 30,
        lineHeight: 1.8,
        color: "#6f685f",
      }}
    >
      当前仍是开发中的版本。
      <br />
      复杂 PRD 需要逐项核对，离生产级还有距离。
    </div>
  </AbsoluteFill>
);

export const ProductIntro: React.FC = () => (
  <AbsoluteFill style={{ background: paper }}>
    <Series>
      <Series.Sequence durationInFrames={frames("intro")}>
        <WithNarration id="intro">
          <Intro />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence
        durationInFrames={frames("architecture")}
        premountFor={30}
      >
        <WithNarration id="architecture">
          <Architecture />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("models")}>
        <WithNarration id="models">
          <Models />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("skills")}>
        <WithNarration id="skills">
          <Skills />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("permissions")}>
        <WithNarration id="permissions">
          <Permissions />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("smb")}>
        <WithNarration id="smb">
          <Sharing />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("resources")}>
        <WithNarration id="resources">
          <Resources />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("slash")}>
        <WithNarration id="slash">
          <SlashCommands />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("prd")}>
        <WithNarration id="prd">
          <PrdDemo />
        </WithNarration>
      </Series.Sequence>
      <Series.Sequence durationInFrames={frames("close")}>
        <WithNarration id="close">
          <Closing />
        </WithNarration>
      </Series.Sequence>
    </Series>
    {!voiceReady ? (
      <div style={{ position: "absolute", right: 100, top: 28, fontSize: 19, color: "#777065", fontFamily: font }}>
        字幕预览 · 无配音
      </div>
    ) : null}
  </AbsoluteFill>
);

export const MyComposition = () => (
  <>
    <Composition
      id="SlashSubtitlePreview"
      component={ProductIntro}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={timings.reduce((sum, t) => sum + t.frames, 0)}
    />
    <Composition
      id="SlashProductIntro"
      component={ProductIntro}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={timings.reduce((sum, t) => sum + t.frames, 0)}
    />
    <Composition
      id="Intro"
      component={Intro}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={frames("intro")}
    />
    <Composition
      id="ModelSettings"
      component={Models}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={frames("models")}
    />
    <Composition
      id="Skills"
      component={Skills}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={frames("skills")}
    />
  </>
);
