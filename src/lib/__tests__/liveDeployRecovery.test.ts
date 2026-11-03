import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("failed live release preserves data", () => {
  it("restores old image and functions without restoring a dump into the live database", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-recovery-"));
    try {
      for (const folder of ["bin", "scripts", "supabase-docker"]) mkdirSync(join(dir,folder),{recursive:true});
      copyFileSync("scripts/deploy.sh",join(dir,"scripts/deploy.sh"));
      writeFileSync(join(dir,"scripts/apply-migrations.sh"),"#!/bin/bash\nexit 1\n");
      chmodSync(join(dir,"scripts/apply-migrations.sh"),0o755);
      for (const name of ["docker","git"]) {
        writeFileSync(join(dir,"bin",name),`#!/bin/bash
printf '%s %s\\n' '${name}' "$*" >> "$REPO_ROOT/actions.log"
if [[ '${name}' == git && "$*" == 'rev-parse HEAD' ]]; then
  if test -f "$REPO_ROOT/reset"; then echo new-sha; else echo old-sha; fi
fi
if [[ '${name}' == git && "$*" == 'reset --hard origin/main' ]]; then touch "$REPO_ROOT/reset"; fi
if [[ '${name}' == docker && "$*" == *'image inspect'* ]]; then echo old-image-id; fi
exit 0
`);
        chmodSync(join(dir,"bin",name),0o755);
      }
      expect(() => execFileSync("bash",[join(dir,"scripts/deploy.sh"),"new-sha"],{
        env:{...process.env,REPO_ROOT:dir,PATH:`${join(dir,"bin")}:${process.env.PATH}`},stdio:"pipe",
      })).toThrow();
      const actions = readFileSync(join(dir,"actions.log"),"utf8");
      expect(actions).toContain("git reset --hard old-sha");
      expect(actions).toContain("docker tag old-image-id hub-smart-energy-frontend:latest");
      expect(actions).toContain("--force-recreate frontend functions");
      expect(actions).not.toContain("psql");
      expect(actions).not.toContain("rollback.sh");
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
});