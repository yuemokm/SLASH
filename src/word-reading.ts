type Node={type:string;value?:string;children?:Node[]};
/** Only host-generated Word cell separators become safe Markdown break nodes.
 * Escaped user HTML is a text node; all other HTML remains subject to skipHtml. */
export function remarkHostWordBreaks(){
 return(tree:Node)=>{const walk=(node:Node)=>{if(node.children)node.children=node.children.map(child=>{if(child.type==='html'&&child.value==='<br/>')return{type:'break'};walk(child);return child;});};walk(tree);};
}
