/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain, shell } from "electron";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { serializeErrors } from "./updater/common";
import { build } from "./updater/git";

const USER_PLUGINS_DIR = join(__dirname, "../../src/userplugins");

const template = (name: string) => `/*
 * Vencord, a Discord client mod
 * Copyright (c) ${new Date().getFullYear()} Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

export default definePlugin({
    name: "${name}",
    description: "My own EnderCord plugin.",
    authors: [{ name: "Me", id: 0n }],

    start() {
        console.log("${name} started!");
    },

    stop() {
        console.log("${name} stopped!");
    }
});
`;

if (!IS_STANDALONE) {
    ipcMain.handle(IpcEvents.OPEN_USERPLUGINS_FOLDER, async () => {
        await mkdir(USER_PLUGINS_DIR, { recursive: true });
        await shell.openPath(USER_PLUGINS_DIR);
    });

    ipcMain.handle(IpcEvents.CREATE_USERPLUGIN, serializeErrors(async (name: unknown) => {
        if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9]{1,63}$/.test(name))
            throw "Plugin names must start with a letter and only contain letters and numbers.";

        const dir = join(USER_PLUGINS_DIR, name[0].toLowerCase() + name.slice(1));
        if (existsSync(dir)) throw `A plugin folder named ${name} already exists.`;

        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "index.tsx"), template(name));
        shell.showItemInFolder(join(dir, "index.tsx"));
    }));

    ipcMain.handle(IpcEvents.BUILD_USERPLUGINS, serializeErrors(async () => {
        if (!await build().catch(() => false))
            throw "The build failed. Run pnpm build in a terminal to see what went wrong.";
    }));
}
