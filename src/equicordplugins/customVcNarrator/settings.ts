/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { OptionType } from "@utils/types";

import { VoiceSettingSection } from "./VoiceSetting";

export const TIKTOK_VOICES = [
    // Disney Voices
    { name: "Ghost Face", id: "en_us_ghostface", lang: "En" },
    { name: "Chewbacca", id: "en_us_chewbacca", lang: "En" },
    { name: "C3PO", id: "en_us_c3po", lang: "En" },
    { name: "Stitch", id: "en_us_stitch", lang: "En" },
    { name: "Stormtrooper", id: "en_us_stormtrooper", lang: "En" },
    { name: "Rocket", id: "en_us_rocket", lang: "En" },
    { name: "Madame Leota", id: "en_female_madam_leota", lang: "En" },
    { name: "Ghost Host", id: "en_male_ghosthost", lang: "En" },
    { name: "Pirate", id: "en_male_pirate", lang: "En" },

    // English Voices
    { name: "English AU - Female", id: "en_au_001", lang: "En" },
    { name: "English AU - Male", id: "en_au_002", lang: "En" },
    { name: "English UK - Male 1", id: "en_uk_001", lang: "En" },
    { name: "English UK - Male 2", id: "en_uk_003", lang: "En" },
    { name: "English US - Female 1", id: "en_us_001", lang: "En" },
    { name: "English US - Female 2", id: "en_us_002", lang: "En" },
    { name: "English US - Male 1", id: "en_us_006", lang: "En" },
    { name: "English US - Male 2", id: "en_us_007", lang: "En" },
    { name: "English US - Male 3", id: "en_us_009", lang: "En" },
    { name: "English US - Male 4", id: "en_us_010", lang: "En" },

    // English Voices (Other)
    { name: "Narrator", id: "en_male_narration", lang: "En" },
    { name: "Wacky", id: "en_male_funny", lang: "En" },
    { name: "Peaceful", id: "en_female_emotional", lang: "En" },
    { name: "Serious", id: "en_male_cody", lang: "En" },

    // Western European
    { name: "French - Male 1", id: "fr_001", lang: "En" },
    { name: "French - Male 2", id: "fr_002", lang: "En" },
    { name: "German - Female", id: "de_001", lang: "En" },
    { name: "German - Male", id: "de_002", lang: "En" },
    { name: "Spanish - Male", id: "es_002", lang: "En" },

    // South American Languages
    { name: "Spanish MX - Male", id: "es_mx_002", lang: "En, Es" },
    { name: "Portuguese BR - Female 1", id: "br_001", lang: "En, Pt" },
    { name: "Portuguese BR - Female 2", id: "br_003", lang: "En, Pt" },
    { name: "Portuguese BR - Female 3", id: "br_004", lang: "En, Pt" },
    { name: "Portuguese BR - Male", id: "br_005", lang: "En, Pt" },

    // Asian Languages
    { name: "Indonesian - Female", id: "id_001", lang: "En" },
    { name: "Japanese - Female 1", id: "jp_001", lang: "En Ja" },
    { name: "Japanese - Female 2", id: "jp_003", lang: "En Ja" },
    { name: "Japanese - Female 3", id: "jp_005", lang: "En Ja" },
    { name: "Japanese - Male", id: "jp_006", lang: "En Ja" },
    { name: "Korean - Male 1", id: "kr_002", lang: "En Ko" },
    { name: "Korean - Female", id: "kr_003", lang: "En Ko" },
    { name: "Korean - Male 2", id: "kr_004", lang: "En Ko" },

    // Vocals
    { name: "Alto", id: "en_female_f08_salut_damour", lang: "" },
    { name: "Tenor", id: "en_male_m03_lobby", lang: "" },
    { name: "Sunshine Soon", id: "en_male_m03_sunshine_soon", lang: "" },
    { name: "Warmy Breeze", id: "en_female_f08_warmy_breeze", lang: "" },
    { name: "Glorious", id: "en_female_ht_f08_glorious", lang: "" },
    { name: "It Goes Up", id: "en_male_sing_funny_it_goes_up", lang: "" },
    { name: "Chipmunk", id: "en_male_m2_xhxs_m03_silly", lang: "" },
    { name: "Dramatic", id: "en_female_ht_f08_wonderful_world", lang: "" }
];

export const getDefaultVoice = () => TIKTOK_VOICES.find(v => v.id === "en_us_001"); // Default to English US Female 1

export function getCurrentVoice() {
    if (settings.store.customVoice) {
        const voice = TIKTOK_VOICES.find(v => v.id === settings.store.customVoice);
        if (voice) return voice;

        new Logger("CustomVcNarrator").error(`Voice "${settings.store.customVoice}" not found. Resetting to default.`);
    }

    const voice = getDefaultVoice();
    settings.store.customVoice = voice?.id;
    return voice;
}

export const settings = definePluginSettings({
    customVoice: {
        type: OptionType.COMPONENT,
        component: VoiceSettingSection,
        get default() {
            return getDefaultVoice()?.id;
        }
    },
    volume: {
        type: OptionType.SLIDER,
        description: "Narrator Volume",
        default: 1,
        markers: [0, 0.25, 0.5, 0.75, 1],
        stickToMarkers: false
    },
    rate: {
        type: OptionType.SLIDER,
        description: "Narrator Speed",
        default: 1,
        markers: [0.1, 0.5, 1, 2, 5, 10],
        stickToMarkers: false
    },
    sayOwnName: {
        description: "Say own name",
        type: OptionType.BOOLEAN,
        default: false
    },
    latinOnly: {
        description: "Strip non latin characters from names before saying them",
        type: OptionType.BOOLEAN,
        default: false
    },
    joinMessage: {
        type: OptionType.STRING,
        description: "Join Message",
        default: "{{USER}} joined"
    },
    leaveMessage: {
        type: OptionType.STRING,
        description: "Leave Message",
        default: "{{USER}} left"
    },
    moveMessage: {
        type: OptionType.STRING,
        description: "Move Message",
        default: "{{USER}} moved to {{CHANNEL}}"
    },
    muteMessage: {
        type: OptionType.STRING,
        description: "Mute Message (only self for now)",
        default: "{{USER}} muted"
    },
    unmuteMessage: {
        type: OptionType.STRING,
        description: "Unmute Message (only self for now)",
        default: "{{USER}} unmuted"
    },
    deafenMessage: {
        type: OptionType.STRING,
        description: "Deafen Message (only self for now)",
        default: "{{USER}} deafened"
    },
    undeafenMessage: {
        type: OptionType.STRING,
        description: "Undeafen Message (only self for now)",
        default: "{{USER}} undeafened"
    }
});
