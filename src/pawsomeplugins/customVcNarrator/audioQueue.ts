/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import type { PluginNative } from "@utils/types";

const logger = new Logger("CustomVcNarrator");

const Native = VencordNative?.pluginHelpers?.CustomVcNarrator as PluginNative<
    typeof import("./native")
> | undefined;

interface NarrationItem {
    text: string;
    voiceId: string;
    volume: number;
    rate: number;
}

const queue: NarrationItem[] = [];
let isProcessing = false;
let currentAudio: HTMLAudioElement | null = null;

// LRU audio cache: key -> blob object URL
const audioCache = new Map<string, string>();
const MAX_CACHE_SIZE = 30;

function getCacheKey(voiceId: string, text: string): string {
    return `${voiceId}:${text.trim().toLowerCase()}`;
}

function addToCache(key: string, url: string) {
    if (audioCache.has(key)) return;

    if (audioCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = audioCache.keys().next().value;
        if (oldestKey) {
            const oldUrl = audioCache.get(oldestKey);
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            audioCache.delete(oldestKey);
        }
    }

    audioCache.set(key, url);
}

function speakNativeFallback(text: string, volume: number, rate: number): Promise<void> {
    return new Promise(resolve => {
        if (typeof speechSynthesis === "undefined") {
            logger.warn("SpeechSynthesis is not available for fallback");
            return resolve();
        }

        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.volume = volume;
            utterance.rate = Math.min(Math.max(rate, 0.1), 10);

            utterance.onend = () => resolve();
            utterance.onerror = e => {
                logger.warn("Native SpeechSynthesis error:", e);
                resolve();
            };

            speechSynthesis.speak(utterance);
        } catch (error) {
            logger.warn("Error running native SpeechSynthesis:", error);
            resolve();
        }
    });
}

async function fetchTikTokAudioUrl(text: string, voiceId: string): Promise<string> {
    const cacheKey = getCacheKey(voiceId, text);
    const cached = audioCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    let base64Data: string;

    if (Native?.fetchTikTokAudio) {
        const res = await Native.fetchTikTokAudio(text, voiceId);
        if (!res.success || !res.data) {
            throw new Error(res.error || "Unknown TTS generation error");
        }
        base64Data = res.data;
    } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
            const response = await fetch("https://tiktok-tts.weilnet.workers.dev/api/generation", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text,
                    voice: voiceId
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`TTS API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as { success?: boolean; data?: string; error?: string; };
            if (!data?.success || !data?.data) {
                throw new Error(data?.error || "Unknown TTS API error");
            }

            base64Data = data.data;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    addToCache(cacheKey, url);
    return url;
}

async function playAudioUrl(url: string, volume: number, rate: number): Promise<void> {
    return new Promise(resolve => {
        const audio = new Audio(url);
        currentAudio = audio;
        audio.volume = Math.max(0, Math.min(volume, 1));
        audio.playbackRate = Math.max(0.25, Math.min(rate, 4));

        const cleanup = () => {
            if (currentAudio === audio) {
                currentAudio = null;
            }
            resolve();
        };

        audio.onended = cleanup;
        audio.onerror = cleanup;

        audio.play().catch(error => {
            logger.warn("Audio playback failed:", error);
            cleanup();
        });
    });
}

async function processQueue(): Promise<void> {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;

        try {
            const url = await fetchTikTokAudioUrl(item.text, item.voiceId);
            await playAudioUrl(url, item.volume, item.rate);
        } catch (error) {
            logger.warn("TikTok TTS generation failed, falling back to Web Speech:", error);
            await speakNativeFallback(item.text, item.volume, item.rate);
        }
    }

    isProcessing = false;
}

export function queueNarration(text: string, voiceId: string, volume: number, rate: number): void {
    if (!text || text.trim().length === 0) return;

    queue.push({
        text: text.trim(),
        voiceId,
        volume,
        rate
    });

    processQueue();
}

export function stopPlaybackQueue(): void {
    queue.length = 0;

    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        } catch {
            // ignore
        }
        currentAudio = null;
    }

    if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking) {
        try {
            speechSynthesis.cancel();
        } catch {
            // ignore
        }
    }

    isProcessing = false;
}
