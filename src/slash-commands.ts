import type {SkillDescriptor} from '../shared/skills';

export type SlashCommand={command:string;description:string;scope?:'project'|'global'};
export const builtinSlashCommands:SlashCommand[]=[
 {command:'/plan',description:'先研究并生成执行方案'},
 {command:'/help',description:'查看可用命令和当前权限'},
];
export function matchingSlashCommands(draft:string,skills:SkillDescriptor[]):SlashCommand[]{
 const query=draft.trim().split(/\s+/)[0].slice(1).toLocaleLowerCase();
 const commands=[...skills.map(skill=>({command:'/skill:'+skill.name,description:skill.description,scope:skill.scope??'project' as const})),...builtinSlashCommands];
 return commands.filter(item=>item.command.slice(1).toLocaleLowerCase().includes(query)||Boolean(item.scope&&item.description.toLocaleLowerCase().includes(query)));
}

export function applySlashCommand(draft:string,command:string):string{
 return `${command} ${draft.trimStart().replace(/^\/[^\s]*(?:\s+|$)/, '')}`;
}
