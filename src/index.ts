import fs from "fs";
import path from "path";
import { ViteDevServer } from "vite";
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
import {
  startAll,
  cleanShutdown,
// @ts-ignore
} from 'firebase-tools/lib/emulator/controller.js';
// @ts-ignore
import { shutdownWhenKilled } from 'firebase-tools/lib/emulator/commandUtils.js';

export interface FirebasePluginOptions {
  projectId: string | ((server: ViteDevServer) => string)
  root?: string
  materializeConfig?: boolean
  targets: string[]
}

export default function firebasePlugin({projectId, root, materializeConfig, targets = ['hosting', 'functions']}: FirebasePluginOptions) {
  return {
    name: "vite:firebase",
    async configureServer(server: ViteDevServer) {
      if (server.config.command !== 'serve') return;
      const projectDir = root || server.config.root;
      if (!process.env.IS_FIREBASE_CLI) {
        process.env.IS_FIREBASE_CLI = 'true';
        setupLoggers();
        shutdownWhenKilled({});
      }
      if (typeof projectId !== 'string') projectId = projectId(server);
      const account = getProjectDefaultAccount(projectDir);
      const options = {
        projectId,
        projectDir,
        nonInteractive: true,
        account,
        only: targets.join(','),
        targets
      };
      const config = Config.load(options);
      // @ts-ignore
      options.config = config;
      setActiveAccount(options, account);
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
      await startAll(options, false);

      // patch server.close to close emulators as well
      const { close } = server;
      server.close = async () => {
        await Promise.all([close(), cleanShutdown()]);
      }
    },
  };
}
