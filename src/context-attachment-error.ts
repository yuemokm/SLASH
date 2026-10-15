/** Keep the full host diagnostic in the chip tooltip; show its readable message. */
export function contextAttachmentErrorMessage(message:string):string{
 return message.replace(/^(?:[A-Z][A-Z0-9_]*:\s*)+/,'').trim()||'文件读取失败，请重试或移除后重新添加';
}
