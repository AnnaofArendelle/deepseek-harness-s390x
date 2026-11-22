/** Simulate the s390x kernel ABI on x64; this does not execute a target binary. */
import {afterEach,describe,expect,it,vi} from 'vitest'
import {endianness} from 'node:os'
import {createProcessInspector} from '@deepseek-ai/dsh-subprocess-local/src/process-inspector.ts'

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {...actual, endianness: vi.fn(() => 'BE')}
})
function stat(pid:number) {
 const rest=['S','1','77','77','99','77'];while(rest.length<19)rest.push('0');rest.push('12345')
 return `${pid} (simulation) ${rest.join(' ')}`
}
function fixture() {
 const files=new Map([['/proc/100/stat',stat(100)],['/proc/101/stat',stat(101)]])
 const memory=Buffer.alloc(64)
 const internals={
  readFile:(path:string)=>{const value=files.get(path);if(value===undefined)throw Error(path);return value},
  readDir:(path:string)=>path==='/proc'?['100','101']:path==='/proc/100/task'?['100']:['101'],
  readLink:()=>'/dev/pts/1',stat:()=>({rdev:99,isCharacterDevice:()=>true}),
  open:()=>1,close:()=>{},read:(_fd:number,b:Buffer,length:number,position:number)=>memory.copy(b,0,position,position+length),
  exec:()=>'',kill:()=>{},
 }
 const inspector=createProcessInspector('linux','s390x',internals)
 const syscall=(value:string)=>files.set('/proc/101/task/101/syscall',value)
 return {inspector,memory,files,syscall}
}
afterEach(()=>vi.mocked(endianness).mockReturnValue('BE'))
describe('s390x big-endian kernel simulation',()=>{
 it('detects read syscall 3 and refuses a non-stdin fd',()=>{
  const f=fixture();f.syscall('3 0x0 0x0 0x0 0x0 0x0 0x0');expect(f.inspector.isStdinWaiting(77,100)).toBe(true)
  f.syscall('3 0x1 0x0 0x0 0x0 0x0 0x0');expect(f.inspector.isStdinWaiting(77,100)).toBe(false)
 })
 it('reads stdin from the last byte of a big-endian fd_set',()=>{
  const f=fixture();f.syscall('301 0x1 0x10 0x0 0x0 0x0 0x0');f.memory[23]=1
  expect(f.inspector.isStdinWaiting(77,100)).toBe(true)
  f.memory[23]=0;f.memory[16]=1;expect(f.inspector.isStdinWaiting(77,100)).toBe(false)
 })
 it.each([168,302])('reads big-endian pollfd for syscall %s with unsigned timeout -1',number=>{
  const f=fixture();f.syscall(`${number} 0x10 0x1 0xffffffffffffffff 0x0 0x0 0xffffffff`)
  f.memory.writeInt32BE(0,16);f.memory.writeInt16BE(1,20);expect(f.inspector.isStdinWaiting(77,100)).toBe(true)
  f.memory.writeInt16BE(0x100,20);expect(f.inspector.isStdinWaiting(77,100)).toBe(false)
 })
 it('rejects unsafe pointers instead of rounding them',()=>{
  const f=fixture();f.syscall('168 0x20000000000001 0x1 0xffffffffffffffff 0x0 0x0 0x0');expect(f.inspector.isStdinWaiting(77,100)).toBe(false)
 })
 it('preserves the little-endian layout on supported hosts',()=>{
  vi.mocked(endianness).mockReturnValue('LE');const f=fixture();f.syscall('168 0x10 0x1 0x0 0x0 0x0 0x0');f.memory.writeInt16LE(1,20)
  expect(f.inspector.isStdinWaiting(77,100)).toBe(true)
 })
})
