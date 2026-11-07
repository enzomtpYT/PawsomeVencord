/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { OptionType } from "@utils/types";

import { VoiceSettingSection } from "./VoiceSetting";

export const logger = new Logger("CustomVcNarrator");

export interface TikTokVoice {
    name: string;
    id: string;
    category: string;
}

export const TIKTOK_VOICES: TikTokVoice[] = [
    // Characters & Pop Culture
    { name: "Ghost Face", id: "en_us_ghostface", category: "Characters & Pop Culture" },
    { name: "Chewbacca", id: "en_us_chewbacca", category: "Characters & Pop Culture" },
    { name: "C3PO", id: "en_us_c3po", category: "Characters & Pop Culture" },
    { name: "Stitch", id: "en_us_stitch", category: "Characters & Pop Culture" },
    { name: "Stormtrooper", id: "en_us_stormtrooper", category: "Characters & Pop Culture" },
    { name: "Rocket", id: "en_us_rocket", category: "Characters & Pop Culture" },
    { name: "Madame Leota", id: "en_female_madam_leota", category: "Characters & Pop Culture" },
    { name: "Ghost Host", id: "en_male_ghosthost", category: "Characters & Pop Culture" },
    { name: "Pirate", id: "en_male_pirate", category: "Characters & Pop Culture" },

    // English Voices
    { name: "English US - Female 1", id: "en_us_001", category: "English" },
    { name: "English US - Female 2", id: "en_us_002", category: "English" },
    { name: "English US - Male 1", id: "en_us_006", category: "English" },
    { name: "English US - Male 2", id: "en_us_007", category: "English" },
    { name: "English US - Male 3", id: "en_us_009", category: "English" },
    { name: "English US - Male 4", id: "en_us_010", category: "English" },
    { name: "English UK - Male 1", id: "en_uk_001", category: "English" },
    { name: "English UK - Male 2", id: "en_uk_003", category: "English" },
    { name: "English AU - Female", id: "en_au_001", category: "English" },
    { name: "English AU - Male", id: "en_au_002", category: "English" },

    // English Voices (Expressive)
    { name: "Narrator", id: "en_male_narration", category: "English (Expressive)" },
    { name: "Wacky", id: "en_male_funny", category: "English (Expressive)" },
    { name: "Peaceful", id: "en_female_emotional", category: "English (Expressive)" },
    { name: "Serious", id: "en_male_cody", category: "English (Expressive)" },

    // European Languages
    { name: "French - Male 1", id: "fr_001", category: "French" },
    { name: "French - Male 2", id: "fr_002", category: "French" },
    { name: "German - Female", id: "de_001", category: "German" },
    { name: "German - Male", id: "de_002", category: "German" },
    { name: "Spanish - Male", id: "es_002", category: "Spanish" },
    { name: "Spanish MX - Male", id: "es_mx_002", category: "Spanish" },
    { name: "Portuguese BR - Female 1", id: "br_001", category: "Portuguese (Brazil)" },
    { name: "Portuguese BR - Female 2", id: "br_003", category: "Portuguese (Brazil)" },
    { name: "Portuguese BR - Female 3", id: "br_004", category: "Portuguese (Brazil)" },
    { name: "Portuguese BR - Male", id: "br_005", category: "Portuguese (Brazil)" },

    // Asian Languages
    { name: "Japanese - Female 1", id: "jp_001", category: "Japanese" },
    { name: "Japanese - Female 2", id: "jp_003", category: "Japanese" },
    { name: "Japanese - Female 3", id: "jp_005", category: "Japanese" },
    { name: "Japanese - Male", id: "jp_006", category: "Japanese" },
    { name: "Korean - Male 1", id: "kr_002", category: "Korean" },
    { name: "Korean - Female", id: "kr_003", category: "Korean" },
    { name: "Korean - Male 2", id: "kr_004", category: "Korean" },
    { name: "Indonesian - Female", id: "id_001", category: "Indonesian" },

    // Vocals & Singing
    { name: "Alto", id: "en_female_f08_salut_damour", category: "Singing & Vocals" },
    { name: "Tenor", id: "en_male_m03_lobby", category: "Singing & Vocals" },
    { name: "Sunshine Soon", id: "en_male_m03_sunshine_soon", category: "Singing & Vocals" },
    { name: "Warmy Breeze", id: "en_female_f08_warmy_breeze", category: "Singing & Vocals" },
    { name: "Glorious", id: "en_female_ht_f08_glorious", category: "Singing & Vocals" },
    { name: "It Goes Up", id: "en_male_sing_funny_it_goes_up", category: "Singing & Vocals" },
    { name: "Chipmunk", id: "en_male_m2_xhxs_m03_silly", category: "Singing & Vocals" },
    { name: "Dramatic", id: "en_female_ht_f08_wonderful_world", category: "Singing & Vocals" }
];

export const getDefaultVoice = () => TIKTOK_VOICES.find(v => v.id === "en_us_001");

export function getCurrentVoice(): TikTokVoice | undefined {
    if (settings.store.customVoice) {
        const voice = TIKTOK_VOICES.find(v => v.id === settings.store.customVoice);
        if (voice) return voice;

        logger.error(`Voice "${settings.store.customVoice}" not found. Resetting to default.`);
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
        description: "Strip non-Latin characters from names before saying them",
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
