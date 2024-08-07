import fs from "fs";
import path from "path";
import { ViteDevServer } from "vite";
// needed because utils and logger have a cyclic dep. Fun.
// @ts-ignore
import 'firebase-tools/lib/logger.js';
// @ts-ignore
import { setupLoggers } from 'firebase-tools/lib/utils.js';
// @ts-ignore
import { getProjectDefaultAccount } from 'firebase-tools/lib/auth.js';
// @ts-ignore
import { Config } from 'firebase-tools/lib/config.js';
// @ts-ignore
import { setActiveAccount } from 'firebase-tools/lib/auth.js';
import {
  materializeAll,
  ensureApi,
// @ts-ignore
} from 'firebase-tools/lib/functionsConfig.js';
// @ts-ignore
import { requireAuth } from 'firebase-tools/lib/requireAuth.js';
// @ts-ignore
import { loadRC } from 'firebase-tools/lib/rc.js';
import {
  startAll,
  cleanShutdown,
// @ts-ignore
} from 'firebase-tools/lib/emulator/controller.js';
// @ts-ignore
import { shutdownWhenKilled } from 'firebase-tools/lib/emulator/commandUtils.js';

export interface FirebasePluginOptions {
  projectId: string | ((server: ViteDevServer) => string)
  projectName: string | ((server: ViteDevServer) => string)
  root?: string
  materializeConfig?: boolean
  targets: string[]
  showUI: boolean
}

export default function firebasePlugin({projectId, projectName = projectId, root, materializeConfig, targets = ['hosting', 'functions'], showUI = false}: FirebasePluginOptions) {
  return {
    name: "vite:firebase",
    async configureServer(server: ViteDevServer) {
      if (server.config.command !== 'serve') return;
      const projectDir = root || server.config.root;
      if (!process.env.IS_FIREBASE_CLI) {
        process.env.IS_FIREBASE_CLI = 'true';
        setupLoggers();
        shutdownWhenKilled({}).then(() => process.exit(0));
      }
      if (typeof projectId !== 'string') projectId = projectId(server);
      if (typeof projectName !== 'string') projectName = projectName(server);
      const account = getProjectDefaultAccount(projectDir);
      const options = {
        projectId,
        project: projectName,
        projectDir,
        nonInteractive: true,
        account,
        only: targets.join(','),
        targets,
      };
      const config = Config.load(options);
      // @ts-ignore
      options.config = config;
      // @ts-ignore
      options.rc = loadRC(options);
      if (account) {
        setActiveAccount(options, account);
      }
      if (materializeConfig) {
        await requireAuth(options);
        await ensureApi(options);
        const settings = await materializeAll(projectId);
        const functionsDir = config.data.functions.source;
        await fs.promises.writeFile(
          path.join(functionsDir, '.runtimeconfig.json'),
          JSON.stringify(settings)
        );
      }
      await startAll(options, showUI);

      // patch server.close to close emulators as well
      const { close } = server;
      server.close = async () => {
        await Promise.all([close(), cleanShutdown()]);
      }
    },
  };
}
