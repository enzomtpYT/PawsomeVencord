/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import definePlugin, { PluginAuthor, PluginDef } from "@utils/types";

import { addSettingsPanelButton, Emitter, MicrophoneSettingsIcon, removeSettingsPanelButton } from "../philsPluginLibrary";
import { PluginInfo } from "./constants";
import { openMicrophoneSettingsModal } from "./modals";
import { MicrophonePatcher } from "./patchers";
import { initMicrophoneStore } from "./stores";

export default definePlugin({
    name: PluginInfo.PLUGIN_NAME,
    description: PluginInfo.DESCRIPTION,
    authors: [PluginInfo.AUTHOR, ...Object.values(PluginInfo.CONTRIBUTORS)] as PluginAuthor[],
    dependencies: ["PhilsPluginLibrary"],
    start(): void {
        initMicrophoneStore();

        this.microphonePatcher = new MicrophonePatcher().patch();

        addSettingsPanelButton({ name: PluginInfo.PLUGIN_NAME, icon: MicrophoneSettingsIcon, tooltipText: "Microphone Settings", onClick: openMicrophoneSettingsModal });
    },
    stop(): void {
        this.microphonePatcher?.unpatch();

        Emitter.removeAllListeners(PluginInfo.PLUGIN_NAME);

        removeSettingsPanelButton(PluginInfo.PLUGIN_NAME);
    }
});