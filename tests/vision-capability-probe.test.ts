import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {challenge,score,validatePayload} from '../scripts/vision-capability-probe.mjs';

test('synthetic PNG contains fresh six-card pixels and numbers with no answer metadata',()=>{
 const first=challenge(),second=challenge();assert.equal(first.png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(first.png.readUInt32BE(16),660);assert.equal(first.png.readUInt32BE(20),420);assert(!first.png.equals(second.png));assert.equal(new Set(first.expected.rows.flat().map((c:{color:string})=>c.color)).size,6);
 const chunks:Buffer[]=[],types:string[]=[];for(let offset=8;offset<first.png.length;){const length=first.png.readUInt32BE(offset),type=first.png.subarray(offset+4,offset+8).toString();types.push(type);if(type==='IDAT')chunks.push(first.png.subarray(offset+8,offset+8+length));offset+=12+length;}
 assert.deepEqual(types,['IHDR','IDAT','IEND']);const raster=inflateSync(Buffer.concat(chunks));assert.equal(raster.length,420*(660*3+1));assert.equal(raster[0],0);assert(!first.prompt.includes(JSON.stringify(first.expected)));assert(first.expected.rows.flat().every((c:{number:number})=>c.number>=10&&c.number<=99));
});

test('score requires every random position, color and number; wrong or extra claims cannot pass',()=>{
 const {expected}=challenge();assert.equal(score(JSON.stringify(expected),expected).outcome,'observed_pixel_understanding_once');const wrong=structuredClone(expected);wrong.rows[0][0].number=wrong.rows[0][0].number===99?10:wrong.rows[0][0].number+1;assert.equal(score(JSON.stringify(wrong),expected).matchedCells,5);assert.equal(score(JSON.stringify({rows:[expected.rows[1],expected.rows[0]]}),expected).matchedCells,0);assert.equal(score(JSON.stringify({...expected,claim:'passed'}),expected).outcome,'unknown_invalid_answer');assert.equal(score('image unavailable',expected).outcome,'unknown_unparseable_answer');
});

test('Responses wire guard rejects changed image, answer text, tools and hidden instructions',()=>{
 const c=challenge(),modelId='test',input={modelId,prompt:c.prompt,image:c.png};const packet={model:modelId,stream:true,max_output_tokens:2048,store:false,input:[{role:'user',content:[{type:'input_text',text:c.prompt},{type:'input_image',image_url:'data:image/png;base64,'+c.png.toString('base64'),detail:'auto'}]}]};validatePayload(packet,input);
 for(const change of [{tools:[{type:'function'}]},{instructions:JSON.stringify(c.expected)},{reasoning:{effort:'high'}},{max_output_tokens:4096},{input:[...packet.input,...packet.input]}])assert.throws(()=>validatePayload({...packet,...change},input));
 const image=structuredClone(packet);image.input[0].content[1].image_url='data:image/png;base64,wrong';assert.throws(()=>validatePayload(image,input));const text=structuredClone(packet);text.input[0].content[0].text+=JSON.stringify(c.expected);assert.throws(()=>validatePayload(text,input));
});
