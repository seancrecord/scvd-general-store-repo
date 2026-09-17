import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Capture only the fresh session's designated public-evidence directory.
// The model transcript is an index, not a transport for signed megabytes.
export function retainArtifacts(cwd, output, budgets) {
  const source=path.join(cwd,'evidence'), target=path.join(output,'evidence');
  fs.mkdirSync(target,{mode:0o700}); // Existing evidence is never overwritten.
  const result={state:'complete',bytes:0,files:[],issues:[]};
  let entries=0;
  const issue=(file,reason)=>{result.state='incomplete';result.issues.push({file,reason});};
  function walk(dir,relative='',depth=0) {
    if(depth>4){issue(relative,'directory_depth');return;}
    const directory=fs.opendirSync(dir);
    try {
      let entry;
      while((entry=directory.readSync())!==null){
        if(++entries>budgets.artifact_files*8){issue(relative,'entry_limit');return;}
        const name=path.join(relative,entry.name),input=path.join(dir,entry.name);
        const stat=fs.lstatSync(input);
        if(stat.isSymbolicLink()){issue(name,'symlink_refused');continue;}
        if(stat.isDirectory()){walk(input,name,depth+1);continue;}
        if(!stat.isFile()||stat.nlink!==1){issue(name,'nonregular_or_linked_file');continue;}
        if(result.files.length>=budgets.artifact_files){issue(name,'file_limit');return;}
        if(stat.size>budgets.artifact_bytes-result.bytes){issue(name,'byte_limit');continue;}
        const fd=fs.openSync(input,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
        try {
          const before=fs.fstatSync(fd);
          if(!before.isFile()||before.nlink!==1||before.ino!==stat.ino||before.size!==stat.size){issue(name,'changed_during_capture');continue;}
          const bytes=Buffer.alloc(stat.size+1);let count=0,n;
          while(count<bytes.length&&(n=fs.readSync(fd,bytes,count,bytes.length-count,null))>0)count+=n;
          const after=fs.fstatSync(fd);
          if(count!==stat.size||after.size!==stat.size||after.mtimeMs!==before.mtimeMs){issue(name,'changed_during_capture');continue;}
          const retained=bytes.subarray(0,count),destination=path.join(target,name);
          fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
          fs.writeFileSync(destination,retained,{flag:'wx',mode:0o600});
          result.bytes+=count;
          result.files.push({file:path.join('evidence',name),bytes:count,sha256:createHash('sha256').update(retained).digest('hex')});
        }finally{fs.closeSync(fd);}
      }
    }finally{directory.closeSync();}
  }
  try {
    const stat=fs.lstatSync(source);
    if(!stat.isDirectory()||stat.isSymbolicLink())issue('evidence','not_a_regular_directory');
    else walk(source);
  }catch(error){issue('evidence',error.code??'capture_failed');}
  return result;
}
