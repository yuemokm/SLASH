import type { Metadata } from 'next';
import './style.css';
export const metadata:Metadata={title:'Slash · 资料问答',description:'基于已授权、已发布资料的只读问答'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="zh-CN"><body>{children}</body></html>;}
