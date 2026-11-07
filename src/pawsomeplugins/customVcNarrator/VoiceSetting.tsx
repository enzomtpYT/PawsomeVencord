/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Paragraph } from "@components/Paragraph";
import { SettingsSection } from "@components/settings/tabs/plugins/components/Common";
import { SearchableSelect, useMemo, useState } from "@webpack/common";

import { getCurrentVoice, settings, TIKTOK_VOICES, TikTokVoice } from "./settings";

function groupBy<T extends object, K extends PropertyKey>(arr: T[], fn: (obj: T) => K) {
    return arr.reduce((acc, obj) => {
        const value = fn(obj);
        acc[value] ??= [];
        acc[value].push(obj);
        return acc;
    }, {} as Record<K, T[]>);
}

interface PickerProps {
    voice: string | undefined;
    voices: TikTokVoice[];
}

function SimplePicker({ voice, voices }: PickerProps) {
    const options = voices.map(v => ({
        label: v.name,
        value: v.id,
        default: v.id === "en_us_001",
    }));

    return (
        <SearchableSelect
            placeholder="Select a voice"
            maxVisibleItems={8}
            options={options}
            value={options.find(o => o.value === voice)?.value}
            onChange={(v: string) => settings.store.customVoice = v}
            closeOnSelect
        />
    );
}

function CategorizedPicker({ voice, voices }: PickerProps) {
    const groupedVoices = useMemo(() => groupBy(voices, v => v.category), [voices]);
    const categories = useMemo(() => Object.keys(groupedVoices), [groupedVoices]);

    const [selectedCategory, setSelectedCategory] = useState<string>(() => {
        const currentVoice = getCurrentVoice();
        return currentVoice?.category ?? categories[0] ?? "English";
    });

    const voicesForCategory = groupedVoices[selectedCategory] || [];

    const categoryOptions = categories.map(cat => ({
        label: cat,
        value: cat
    }));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <SettingsSection
                id="narrator-voice-category"
                name="Voice Category"
                description="Choose the accent, language, or voice style."
            >
                <SearchableSelect
                    placeholder="Select a category"
                    options={categoryOptions}
                    value={categoryOptions.find(c => c.value === selectedCategory)?.value}
                    onChange={(cat: string) => {
                        setSelectedCategory(cat);
                        const firstVoice = groupedVoices[cat]?.[0];
                        if (firstVoice) {
                            settings.store.customVoice = firstVoice.id;
                        }
                    }}
                    maxVisibleItems={8}
                    closeOnSelect
                />
            </SettingsSection>

            <SettingsSection
                id="narrator-voice-selection"
                name="Specific Voice"
                description="Select which character or narrator to speak with."
            >
                <SimplePicker
                    voice={voice}
                    voices={voicesForCategory}
                />
            </SettingsSection>
        </div>
    );
}

export function VoiceSettingSection() {
    const { customVoice } = settings.use(["customVoice"]);

    if (!TIKTOK_VOICES.length) {
        return <Paragraph>No voices found.</Paragraph>;
    }

    return <CategorizedPicker voice={customVoice} voices={TIKTOK_VOICES} />;
}
