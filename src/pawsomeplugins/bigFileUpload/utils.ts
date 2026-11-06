/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendBotMessage } from "@api/Commands";
import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { SelectedChannelStore, showToast as showDiscordToast } from "@webpack/common";

import { settings } from "./settings";
import { BigFileUploadNative } from "./types";

export const logger = new Logger("BigFileUpload");

export const Native = VencordNative.pluginHelpers.BigFileUpload as BigFileUploadNative;

export function showToast(text: string, type?: "success" | "failure" | "message") {
    showDiscordToast({
        text,
        variant: type === "failure" ? "critical" : type === "success" ? "success" : "default"
    });
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    return String(error);
}

export function sendTextToChat(text: string) {
    if (settings.store.autoSend === "No") {
        insertTextIntoChatInputBox(text);
    } else {
        const channelId = SelectedChannelStore.getChannelId();
        sendMessage(channelId, { content: text });
    }
}

export function formatUrlForChat(fileName: string, url: string): string {
    return settings.store.autoFormat === "Yes" ? `[${fileName}](${url})` : url;
}

export function handleCSPError(error: unknown, serviceName: string, channelId: string): boolean {
    const errorMessage = getErrorMessage(error);
    const isCSPError = errorMessage.includes("Content Security Policy") ||
        errorMessage.includes("CSP") ||
        errorMessage.includes("violates the following Content Security Policy directive");

    const isNetworkFetchFailed = /fetch failed|Failed to fetch|ENOTFOUND|ECONNREFUSED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED/i.test(errorMessage);

    if (isCSPError || isNetworkFetchFailed) {
        logger.error(`${isCSPError ? "CSP" : "Network"} issue with ${serviceName}`);

        const genericAdvice = "**Try:**\n" +
            "• Use the **Custom uploader** with a CSP-friendly domain\n" +
            "• Switch to GoFile which often bypasses CSP\n" +
            "• Check plugin settings for alternative uploaders\n";

        const ziplineAdvice = serviceName === "Zipline"
            ? ("\n**Zipline checks:**\n" +
                "• Verify the Server URL is correct and includes /api/upload\n" +
                "• Ensure your Authorization token is valid (no 'Bearer ' prefix unless your server requires it)\n" +
                "• If behind Cloudflare or a reverse proxy, disable browser challenges for API routes\n" +
                "• Check SSL/TLS cert validity; Electron may reject invalid/self-signed certs\n")
            : "";

        sendBotMessage(channelId, {
            content: `**${serviceName} upload failed due to ${isCSPError ? "Content Security Policy" : "network connectivity"}**\n` +
                (isCSPError
                    ? `Discord's security policy is preventing uploads to ${serviceName}.\n\n`
                    : `The request to ${serviceName} failed to connect.\n\n`) +
                genericAdvice + ziplineAdvice +
                "\n-# If the issue persists, check the console for full error details."
        });

        showToast(`${serviceName}: ${isCSPError ? "Blocked by CSP" : "Network/CSP error"}`, "failure");
        return true;
    }
    return false;
}
