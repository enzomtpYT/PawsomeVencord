/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Paragraph } from "@components/Paragraph";
import { copyToClipboard } from "@utils/clipboard";
import type { GuildMember } from "@vencord/discord-types";
import {
    GuildMemberStore,
    React,
    SearchableSelect,
    showToast,
    TextInput,
    useEffect,
    useMemo,
    UserProfileStore,
    UserStore,
    useState
} from "@webpack/common";

import { applyPresetValues, resetProfileOverrides } from "../actions";
import { deletePreset, exportPresetJson, getPresets, parsePresetJson, savePreset } from "../storage";
import type { ServerProfilePreset } from "../types";

let volatileClipboard: ServerProfilePreset | null = null;

function getCurrentProfileSnapshot(guildId: string): ServerProfilePreset {
    const currentUser = UserStore.getCurrentUser();
    const profile = UserProfileStore.getGuildMemberProfile(currentUser.id, guildId);
    const nick = GuildMemberStore.getNick(guildId, currentUser.id);
    const selfMember = GuildMemberStore.getMember(guildId, currentUser.id) as (GuildMember & { avatarDecoration?: string; }) | undefined;

    return {
        id: `preset_${Date.now()}`,
        name: `Preset ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        timestamp: Date.now(),
        nick: nick ?? "",
        pronouns: profile?.pronouns ?? null,
        bio: profile?.bio ?? null,
        themeColors: profile?.themeColors,
        banner: profile?.banner ?? undefined,
        avatar: selfMember?.avatar ?? undefined,
        profileEffectId: profile?.profileEffectId,
        avatarDecoration: selfMember?.avatarDecoration
    };
}

export function ToolboxPanel({ guildId }: { guildId: string; }) {
    const [presets, setPresets] = useState<ServerProfilePreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>();
    const [isSavingNew, setIsSavingNew] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");

    const currentUser = UserStore.getCurrentUser();
    const isNitro = (currentUser?.premiumType ?? 0) === 2;

    useEffect(() => {
        getPresets().then(list => {
            setPresets(list);
            if (list.length > 0 && !selectedPresetId) {
                setSelectedPresetId(list[0].id);
            }
        });
    }, [guildId]);

    const presetOptions = useMemo(() => {
        return presets.map(p => ({
            label: `${p.name} (${new Date(p.timestamp).toLocaleDateString()})`,
            value: p.id
        }));
    }, [presets]);

    const handleApplySelected = () => {
        const selected = presets.find(p => p.id === selectedPresetId);
        if (!selected) {
            showToast({ text: "Please select a preset to apply", variant: "critical" });
            return;
        }

        applyPresetValues(selected, isNitro, guildId);
        showToast({ text: `Applied profile preset "${selected.name}"`, variant: "success" });
    };

    const handleSaveNewPreset = async () => {
        const trimmed = newPresetName.trim();
        if (!trimmed) {
            showToast({ text: "Please enter a preset name", variant: "critical" });
            return;
        }

        const currentProfile = getCurrentProfileSnapshot(guildId);
        const presetToSave: ServerProfilePreset = {
            ...currentProfile,
            name: trimmed
        };

        const updated = await savePreset(presetToSave);
        setPresets(updated);
        setSelectedPresetId(presetToSave.id);
        setNewPresetName("");
        setIsSavingNew(false);
        showToast({ text: `Saved preset "${trimmed}"`, variant: "success" });
    };

    const handleDeleteSelected = async () => {
        if (!selectedPresetId) return;

        const target = presets.find(p => p.id === selectedPresetId);
        const updated = await deletePreset(selectedPresetId);
        setPresets(updated);
        setSelectedPresetId(updated[0]?.id);
        showToast({ text: `Deleted preset "${target?.name ?? "Preset"}"`, variant: "success" });
    };

    const handleQuickCopy = () => {
        const snapshot = getCurrentProfileSnapshot(guildId);
        volatileClipboard = snapshot;
        copyToClipboard(exportPresetJson(snapshot));
        showToast({ text: "Current profile copied to clipboard & memory", variant: "success" });
    };

    const handleQuickPaste = async () => {
        let presetToApply = volatileClipboard;

        try {
            const clipText = await navigator.clipboard.readText();
            if (clipText?.trim()) {
                const parsed = parsePresetJson(clipText);
                if (parsed) {
                    presetToApply = parsed;
                }
            }
        } catch {
            // Clipboard read permission might fail, fallback to volatileClipboard
        }

        if (!presetToApply) {
            showToast({ text: "No profile data in clipboard to paste", variant: "critical" });
            return;
        }

        applyPresetValues(presetToApply, isNitro, guildId);
        showToast({ text: `Pasted profile settings (${presetToApply.name || "copied profile"})`, variant: "success" });
    };

    const handleImportFromClipboard = async () => {
        try {
            const clipText = await navigator.clipboard.readText();
            if (!clipText?.trim()) {
                showToast({ text: "Clipboard is empty", variant: "critical" });
                return;
            }

            const parsed = parsePresetJson(clipText);
            if (!parsed) {
                showToast({ text: "Invalid profile JSON format in clipboard", variant: "critical" });
                return;
            }

            const updated = await savePreset(parsed);
            setPresets(updated);
            setSelectedPresetId(parsed.id);
            showToast({ text: `Imported preset "${parsed.name}"`, variant: "success" });
        } catch (err) {
            showToast({ text: `Failed to import preset: ${err}`, variant: "critical" });
        }
    };

    const handleReset = () => {
        resetProfileOverrides(isNitro, guildId);
        showToast({ text: "Reset server profile overrides to defaults", variant: "success" });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Paragraph style={{ margin: 0, color: "var(--text-muted)" }}>
                Manage, save, and switch between profile presets for this server, or share configurations via JSON.
            </Paragraph>

            {/* Preset Selector & Primary Actions */}
            <Card style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", background: "var(--background-secondary)" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                        <SearchableSelect
                            placeholder={presetOptions.length ? "Choose a saved preset..." : "No saved presets"}
                            options={presetOptions}
                            value={presetOptions.find(o => o.value === selectedPresetId)?.value}
                            onChange={(val: string) => setSelectedPresetId(val)}
                            closeOnSelect
                        />
                    </div>
                    <Button
                        size="small"
                        variant="primary"
                        disabled={!selectedPresetId || !presets.length}
                        onClick={handleApplySelected}
                    >
                        Apply Preset
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={() => setIsSavingNew(!isSavingNew)}
                    >
                        {isSavingNew ? "Cancel" : "Save Current As..."}
                    </Button>
                    <Button
                        size="small"
                        variant="dangerPrimary"
                        disabled={!selectedPresetId || !presets.length}
                        onClick={handleDeleteSelected}
                    >
                        Delete
                    </Button>
                </div>

                {isSavingNew && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                        <div style={{ flex: 1 }}>
                            <TextInput
                                placeholder="Enter new preset name (e.g. Gaming, Casual, Professional)..."
                                value={newPresetName}
                                onChange={setNewPresetName}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                    if (e.key === "Enter") handleSaveNewPreset();
                                }}
                                autoFocus
                            />
                        </div>
                        <Button size="small" variant="positive" onClick={handleSaveNewPreset}>
                            Save
                        </Button>
                    </div>
                )}
            </Card>

            {/* Quick Actions Row */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Button size="small" variant="secondary" onClick={handleQuickCopy}>
                    Quick Copy
                </Button>
                <Button size="small" variant="secondary" onClick={handleQuickPaste}>
                    Quick Paste
                </Button>
                <Button size="small" variant="secondary" onClick={handleImportFromClipboard}>
                    Import JSON
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    disabled={!selectedPresetId}
                    onClick={() => {
                        const selected = presets.find(p => p.id === selectedPresetId);
                        if (selected) {
                            copyToClipboard(exportPresetJson(selected));
                            showToast({ text: `Copied JSON for "${selected.name}"`, variant: "success" });
                        }
                    }}
                >
                    Export JSON
                </Button>
                <Button size="small" variant="dangerSecondary" onClick={handleReset}>
                    Reset Profile
                </Button>
            </div>
        </div>
    );
}
