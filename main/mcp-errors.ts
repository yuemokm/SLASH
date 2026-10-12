export class McpSafeError extends Error{constructor(public code:'needs_auth'|'cancelled'|'oauth_failed'|'catalog_limit'|'connection_failed'|'elicitation_failed',message:string){super(message);this.name='McpSafeError';}}
/** Remote OAuth/HTTP errors may contain callback codes, token bodies or URLs. */
export function safeMcpMessage(error:unknown){
 if(error instanceof McpSafeError)return error.message;
 if(error instanceof Error&&error.message==='MCP_CREDENTIAL_UNAVAILABLE')return '系统安全存储不可用或凭据无法解密，请重新登录';
 return 'MCP 连接失败；请检查服务地址、网络和登录状态（远端原始错误已隐藏）';
}
