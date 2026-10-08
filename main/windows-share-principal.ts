/** Fixed read-only native principal lookup. No credentials or account mutation. */
export const sharePrincipalLookupScript=String.raw`if(-not ('SlashSharePrincipalLookup' -as [type])){
try{Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SlashSharePrincipalLookup {
 [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool LookupAccountSid(string system, byte[] sid, StringBuilder name, ref uint nameLength, StringBuilder domain, ref uint domainLength, out int use);
}
'@
}catch{}
}
function Resolve-SharePrincipal([string]$account,[string]$knownSid=''){
 $result=[ordered]@{sid=$null;canonicalName='';kind='unknown';resolved=$false}
 try{
  if($knownSid){$identifier=[Security.Principal.SecurityIdentifier]::new($knownSid)}
  elseif($account -match '^S-1-'){$identifier=[Security.Principal.SecurityIdentifier]::new($account)}
  else{$identifier=([Security.Principal.NTAccount]::new($account)).Translate([Security.Principal.SecurityIdentifier])}
  $result.sid=$identifier.Value
  $bytes=New-Object byte[] $identifier.BinaryLength;$identifier.GetBinaryForm($bytes,0)
  [uint32]$nameLength=0;[uint32]$domainLength=0;[int]$use=0
  $null=[SlashSharePrincipalLookup]::LookupAccountSid($null,$bytes,$null,[ref]$nameLength,$null,[ref]$domainLength,[ref]$use)
  if($nameLength -eq 0){return $result}
  $name=[Text.StringBuilder]::new([int]$nameLength);$domain=[Text.StringBuilder]::new([int]$domainLength)
  if([SlashSharePrincipalLookup]::LookupAccountSid($null,$bytes,$name,[ref]$nameLength,$domain,[ref]$domainLength,[ref]$use)){
   $result.canonicalName=$(if($domain.Length -gt 0){$domain.ToString()+'\'+$name.ToString()}else{$name.ToString()})
   $result.kind=$(if($use -eq 1){'user'}elseif($use -in @(2,4,5)){'group'}else{'unknown'})
   $result.resolved=$true
  }
 }catch{}
 return $result
}`;
