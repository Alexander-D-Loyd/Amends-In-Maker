// Offline recognition of a standalone scanned '- 0 -'. Never infer a cutoff
// from a dash inside prose, a page number, or a general document footer.
export function scannedEndMarker({data,width,height},scale=1){
 const x0=Math.floor(width*.3),x1=Math.ceil(width*.7),y0=Math.floor(60*scale),y1=height-Math.floor(25*scale);
 const ink=(x,y)=>{const i=(y*width+x)*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114<170&&data[i+3]>128;};
 const seen=new Uint8Array(width*height),parts=[];
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const index=y*width+x;if(seen[index]||!ink(x,y))continue;
  const queue=[index];seen[index]=1;let left=x,right=x,top=y,bottom=y,count=0;
  while(queue.length){const p=queue.pop(),px=p%width,py=Math.floor(p/width);count++;left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=px+dx,ny=py+dy,n=ny*width+nx;if(nx>=x0&&nx<x1&&ny>=y0&&ny<y1&&!seen[n]&&ink(nx,ny)){seen[n]=1;queue.push(n);}}
  }
  if(count>=2)parts.push({left,right,top,bottom,w:right-left+1,h:bottom-top+1});
 }
 const dash=p=>p.w>=2*scale&&p.w<=9*scale&&p.h<=3*scale&&p.w>=p.h*1.5;
 const hole=p=>{const visited=new Set(),queue=[];
  for(let x=p.left;x<=p.right;x++){queue.push([x,p.top],[x,p.bottom]);}for(let y=p.top;y<=p.bottom;y++)queue.push([p.left,y],[p.right,y]);
  while(queue.length){const [x,y]=queue.pop(),key=y*width+x;if(x<p.left||x>p.right||y<p.top||y>p.bottom||visited.has(key)||ink(x,y))continue;visited.add(key);queue.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
  for(let y=p.top+1;y<p.bottom;y++)for(let x=p.left+1;x<p.right;x++)if(!ink(x,y)&&!visited.has(y*width+x))return true;
  return false;
 };
 for(const zero of parts){
  if(zero.w<3*scale||zero.w>12*scale||zero.h<6*scale||zero.h>19*scale||zero.h<zero.w*1.1||!hole(zero))continue;
  const middle=(zero.top+zero.bottom)/2;
  const aligned=p=>dash(p)&&Math.abs((p.top+p.bottom)/2-middle)<zero.h*.3;
  const left=parts.find(p=>aligned(p)&&p.right<zero.left&&zero.left-p.right<=10*scale);
  const right=parts.find(p=>aligned(p)&&p.left>zero.right&&p.left-zero.right<=10*scale);
  if(!left||!right)continue;
  let extra=0;
  for(let y=Math.max(0,zero.top-2);y<=Math.min(height-1,zero.bottom+2);y++)for(let x=Math.floor(width*.1);x<width*.9;x++)if((x<left.left-2||x>right.right+2)&&ink(x,y))extra++;
  if(extra>3*scale*scale)continue;
  return {top:zero.top/scale,bottom:zero.bottom/scale};
 }
 return null;
}
