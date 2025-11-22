/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
let script: string | null = null;



const enum Follower {
    Oneko,
    Tora,
    Dog,
}

function getFollowerMap(who: Follower): string {
    switch (who) {
        case Follower.Oneko:
            return "https://i.imgur.com/Va6wavs.png";
        case Follower.Tora:
            return "https://i.imgur.com/Xvi7xiX.png";
        case Follower.Dog:
            return "https://i.imgur.com/RXjBjN2.png";
        default:
            return "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";
    }
}

function applySettingsChangeAndExec() {
    if (!Vencord.Plugins.isPluginEnabled("Oneko")) return;
    if (!script) {
        console.error("[oneko] script is not loaded");
        return;
    }

    document.getElementById("oneko")?.remove();
    (0, eval)(script.replace("./oneko.gif", getFollowerMap(settings.store.follower))
        .replace("const nekoSpeed = 10;", `const nekoSpeed = ${settings.store.speed};`)
        .replace("(isReducedMotion)", "(false)")
    );
}


const settings = definePluginSettings({
    speed: {
        description: "Speed of Da Cat :3",
        type: OptionType.NUMBER,
        default: 10,
        isValid: (value: number) => {
            if (value && value < 0) return "The number must be bigger than 0";
            return true;
        },
        onChange: applySettingsChangeAndExec
    },
    follower: {
        type: OptionType.SELECT,
        description: "Choose which neko follows mouse",
        options: [
            { label: "Oneko", value: Follower.Oneko, default: true },
            { label: "Tora", value: Follower.Tora },
            { label: "Dog", value: Follower.Dog },
        ],
        onChange: applySettingsChangeAndExec
    }
});

migratePluginSettings("Oneko", "oneko");
export default definePlugin({
    name: "Oneko",
    description: "cat follow mouse (real)",
    // Listing adryd here because this literally just evals her script
    authors: [Devs.Ven, Devs.adryd],
    settings,

    start() {
        fetch("https://raw.githubusercontent.com/adryd325/oneko.js/c4ee66353b11a44e4a5b7e914a81f8d33111555e/oneko.js")
            .then(x => x.text())
            .then(sc => script = sc)
            .then(_ => applySettingsChangeAndExec());
    },

    stop() {
        document.getElementById("oneko")?.remove();
    }
});
