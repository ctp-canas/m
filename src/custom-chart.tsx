import {Bar,BarChart,CartesianGrid,Cell,Legend,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import type {AnalysisResult,ChartType} from './custom-statistics';

export const chartColors=['#08766e','#345d92','#a35d17','#73519c','#a64966','#427340','#287b92','#64656e'];
export const quantity=(value:number,unit:string)=>`${value.toLocaleString('es-CR',{maximumFractionDigits:2})}${unit==='Porcentaje'?' %':''}`;
const short=(value:string,length=27)=>value.length>length?`${value.slice(0,length-1)}…`:value;
const integerAxis=(result:AnalysisResult)=>result.unit==='Estudiantes'||result.unit==='Cupos'&&!result.series.includes('Promedio');
export function chartMaximum(result:AnalysisResult,format:ChartType){
  if(result.unit==='Porcentaje')return 100;
  const peak=Math.max(1,...result.matrix.map(row=>format==='stacked'?row.values.reduce((sum,n)=>sum+n,0):Math.max(0,...row.values)));
  return integerAxis(result)?Math.ceil(peak/4)*4:peak;
}

export function CustomChart({result,format}:{result:AnalysisResult;format:ChartType}){
  if(format==='pie'||format==='donut'){
    const data=result.matrix.map(row=>({name:row.label,value:row.values[0]}));
    return <div className="custom-pie"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={format==='donut'?'42%':0} outerRadius="73%" isAnimationActive={false}>
        {data.map((row,index)=><Cell key={row.name} fill={chartColors[index%chartColors.length]}/>)}
      </Pie><Tooltip formatter={value=>[quantity(Number(value),result.unit),result.series[0]]}/><Legend formatter={value=>short(String(value),35)}/></PieChart>
    </ResponsiveContainer></div>;
  }
  const histogram=format==='histogram';
  const data=result.matrix.map(row=>({label:row.label,...Object.fromEntries(row.values.map((n,i)=>[`v${i}`,n]))}));
  const integer=integerAxis(result);
  const tick=(value:string)=>short(value,histogram?8:29);
  const bars=result.series.map((name,index)=><Bar key={index} dataKey={`v${index}`} name={name} fill={chartColors[index]}
    stackId={format==='stacked'?'grupo':undefined} maxBarSize={histogram?undefined:20} isAnimationActive={false}/>);
  return <div className="custom-plot-scroll" role="region" tabIndex={0} aria-label="Gráfico estadístico">
    <div style={{height:histogram?300:Math.max(230,75+result.matrix.length*Math.max(28,result.series.length*12)),minWidth:histogram?Math.max(275,result.matrix.length*37):275}}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout={histogram?'horizontal':'vertical'} margin={{top:14,right:25,left:4,bottom:10}} barCategoryGap={histogram?0:'22%'} barGap={histogram?0:2}>
          <CartesianGrid strokeDasharray="4 4" vertical={!histogram} horizontal={histogram}/>
          {histogram?<><XAxis dataKey="label" tickFormatter={tick}/><YAxis allowDecimals={false} domain={[0,chartMaximum(result,format)]}/></>:
            <><XAxis type="number" domain={[0,chartMaximum(result,format)]} allowDecimals={!integer} tickFormatter={n=>quantity(Number(n),result.unit)}/>
              <YAxis type="category" dataKey="label" width="auto" tick={{fontSize:12}} tickFormatter={tick}/></>}
          <Tooltip formatter={value=>quantity(Number(value),result.unit)}/><Legend/>{bars}
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

export function paintChart(result:AnalysisResult,format:ChartType,font='sans-serif',rows=result.matrix,withMetadata=false){
  const canvas=document.createElement('canvas');
  const pie=format==='pie'||format==='donut', histogram=format==='histogram';
  const line=Math.max(44,result.series.length*19+10);
  canvas.width=1100;
  const chartHeight=pie||histogram?560:Math.max(250,105+rows.length*line);
  canvas.height=chartHeight;
  const ctx=canvas.getContext('2d')!;
  const text=(value:string,x:number,y:number,weight='normal',size=20,align:CanvasTextAlign='left')=>{
    ctx.fillStyle='#17332f';ctx.textAlign=align;ctx.font=`${weight} ${size}px ${font}`;ctx.fillText(value,x,y);
  };
  const meta:{line:string;size:number;weight:string}[]=[];
  if(withMetadata){
    const lines=(value:string,size:number,weight:string)=>{
      ctx.font=`${weight} ${size}px ${font}`;
      let row='';
      for(const word of value.split(/\s+/)){
        const candidate=row?`${row} ${word}`:word;
        if(row&&ctx.measureText(candidate).width>1045){meta.push({line:row,size,weight});row=word}
        else row=candidate;
      }
      if(row)meta.push({line:row,size,weight});
    };
    lines(result.title,26,'bold');lines(result.scope,18,'normal');lines(result.summary,18,'normal');
    canvas.height=chartHeight+22+meta.reduce((height,item)=>height+item.size+9,0);
  }
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(meta.length){
    let y=8;
    for(const item of meta){
      y+=item.size+9;
      text(item.line,24,y,item.weight,item.size);
    }
    ctx.translate(0,y+14);
  }
  if(pie){
    const total=rows.reduce((sum,row)=>sum+row.values[0],0);
    let start=-Math.PI/2;
    rows.forEach((row,index)=>{
      const end=start+Math.PI*2*row.values[0]/total;
      ctx.beginPath();ctx.moveTo(270,270);ctx.arc(270,270,200,start,end);ctx.closePath();
      ctx.fillStyle=chartColors[index%chartColors.length];ctx.fill();start=end;
      ctx.fillRect(545,80+index*49,22,22);
      text(`${short(row.label,44)} · ${quantity(row.values[0],result.unit)}`,582,98+index*49);
    });
    if(format==='donut'){
      ctx.beginPath();ctx.arc(270,270,98,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
    }
    return canvas;
  }
  const max=chartMaximum(result,format), left=histogram?86:322, right=1040, top=63;
  const axisEnd=histogram?478:top+rows.length*line;
  for(let i=0;i<=4;i++){
    const n=max*i/4;
    const x=histogram?left:left+(right-left)*i/4;
    const y=histogram?axisEnd-(axisEnd-top)*i/4:top;
    ctx.strokeStyle='#d6e1dd';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(histogram?right:x,histogram?y:axisEnd);ctx.stroke();
    text(quantity(n,result.unit),histogram?left-12:x,histogram?y+5:axisEnd+25,'normal',16,histogram?'right':'center');
  }
  rows.forEach(({label,values},index)=>{
    if(histogram){
      const width=(right-left)/rows.length,height=(axisEnd-top)*values[0]/max;
      ctx.fillStyle=chartColors[0];ctx.fillRect(left+index*width,axisEnd-height,width,height);
      ctx.strokeStyle='#fff';if(height>0)ctx.strokeRect(left+index*width,axisEnd-height,width,height);
      text(label,left+(index+0.5)*width,axisEnd+26,'normal',16,'center');
      return;
    }
    const mid=top+(index+0.5)*line;
    text(short(label,29),left-12,mid+6,'normal',18,'right');
    let x=left;
    values.forEach((n,i)=>{
      const grouped=format==='grouped',barHeight=grouped?15:23;
      const y=grouped?mid-(values.length*19)/2+i*19:mid-barHeight/2;
      const width=(right-left)*n/max;
      ctx.fillStyle=chartColors[i];ctx.fillRect(x,y,width,barHeight);
      if(format==='stacked')x+=width;
    });
  });
  if(histogram)text('Edad en años',(left+right)/2,536,'bold',17,'center');
  else text(result.unit,(left+right)/2,axisEnd+49,'bold',17,'center');
  result.series.forEach((name,i)=>{
    const x=24+(i%4)*270,y=12+Math.floor(i/4)*24;
    ctx.fillStyle=chartColors[i];ctx.fillRect(x,y,15,15);text(short(name,22),x+23,y+14,'normal',17);
  });
  return canvas;
}
