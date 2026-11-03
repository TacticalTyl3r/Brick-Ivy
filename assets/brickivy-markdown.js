/* Brick & Ivy restricted Markdown renderer for public property overviews.
 * Intentionally no raw HTML, embedded images, javascript: URLs, or CSS.
 * Generates only a fixed allowlist of markup after escaping all user text.
 * Shared by the public detail page and the staff editor live preview.
 */
(function(global){
 "use strict";
 const escape=value=>String(value??"").replace(/[&<>"']/g,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 })[ch]);
 const safeLink=value=>{
  try{
   const url=new URL(String(value).trim());
   if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return null;
   return url.href;
  }catch{return null}
 };
 function inline(value,depth=0){
  const text=String(value??"");
  let html="",i=0;
  while(i<text.length){
   const char=text[i];
   if(char==="\\"&&i+1<text.length&&/[*_~\`[\]()#+.!\\>-]/.test(text[i+1])){
    html+=escape(text[i+1]);i+=2;continue;
   }
   if(char==="\`"){
    const end=text.indexOf("\`",i+1);
    if(end>i+1){html+="<code>"+escape(text.slice(i+1,end))+"</code>";i=end+1;continue}
   }
   if(char==="["){
    const match=/^\[([^\]\n]{1,160})\]\(([^)\n]{1,2048})\)/.exec(text.slice(i));
    if(match){
     const url=safeLink(match[2]);
     if(url){
      html+='<a href="'+escape(url)+'" target="_blank" rel="noopener noreferrer nofollow">'+escape(match[1])+"</a>";
      i+=match[0].length;continue;
     }
    }
   }
   if(depth<8){
    let matched=false;
    for(const [mark,tag] of [["**","strong"],["__","strong"],["~~","del"],["*","em"],["_","em"]]){
     if(!text.startsWith(mark,i))continue;
     if(mark.includes("_")&&i>0&&/[\p{L}\p{N}]/u.test(text[i-1]))continue;
     const close=text.indexOf(mark,i+mark.length);
     if(close<=i+mark.length)continue;
     if(mark.includes("_")&&close+mark.length<text.length&&/[\p{L}\p{N}]/u.test(text[close+mark.length]))continue;
     const segment=text.slice(i+mark.length,close);
     if(!segment.trim())continue;
     html+="<"+tag+">"+inline(segment,depth+1)+"</"+tag+">";
     i=close+mark.length;matched=true;break;
    }
    if(matched)continue;
   }
   html+=escape(char);i++;
  }
  return html;
 }
 function render(input){
  const raw=String(input??"").replace(/\r\n?/g,"\n").slice(0,3000);
  if(!raw.trim())return "";
  const lines=raw.split("\n"),out=[],paragraph=[];
  let list=null,codeLines=null,quote=[];
  function flushParagraph(){
   if(paragraph.length){out.push("<p>"+paragraph.map(v=>inline(v)).join("<br>")+"</p>");paragraph.length=0}
  }
  function flushList(){
   if(list){out.push("<"+list.tag+">"+list.items.map(v=>"<li>"+inline(v)+"</li>").join("")+"</"+list.tag+">");list=null}
  }
  function flushQuote(){
   if(quote.length){out.push("<blockquote><p>"+quote.map(v=>inline(v)).join("<br>")+"</p></blockquote>");quote=[]}
  }
  function flush(){flushParagraph();flushList();flushQuote()}
  for(const line of lines){
   const trimmed=line.trim();
   if(codeLines!==null){
    if(/^ {0,3}\`{3,}\s*$/.test(line)){
     out.push("<pre><code>"+escape(codeLines.join("\n"))+"</code></pre>");codeLines=null;
    }else codeLines.push(line);
    continue;
   }
   if(/^ {0,3}\`{3,}(?:[a-zA-Z0-9_-]+)?\s*$/.test(line)){
    flush();codeLines=[];continue;
   }
   if(!trimmed){flush();continue}
   const heading=/^ {0,3}(#{1,3})[ \t]+(.+)$/.exec(line);
   if(heading){
    flush();
    const tag="h"+(heading[1].length+2);
    out.push("<"+tag+">"+inline(heading[2].trim())+"</"+tag+">");continue;
   }
   if(/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){
    flush();out.push("<hr>");continue;
   }
   const q=/^ {0,3}>[ \t]?(.*)$/.exec(line);
   if(q){
    flushParagraph();flushList();quote.push(q[1]);continue;
   }
   flushQuote();
   const unordered=/^ {0,3}[-*+][ \t]+(.+)$/.exec(line);
   const ordered=/^ {0,3}\d+[.)][ \t]+(.+)$/.exec(line);
   if(unordered||ordered){
    flushParagraph();
    const tag=unordered?"ul":"ol";
    if(list&&list.tag!==tag)flushList();
    if(!list)list={tag,items:[]};
    list.items.push((unordered||ordered)[1]);continue;
   }
   flushList();paragraph.push(line.trim());
  }
  flush();
  if(codeLines!==null)out.push("<pre><code>"+escape(codeLines.join("\n"))+"</code></pre>");
  return out.join("\n");
 }
 global.BrickIvyMarkdown=Object.freeze({render,escape});
})(window);
