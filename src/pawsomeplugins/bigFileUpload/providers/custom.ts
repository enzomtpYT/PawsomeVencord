/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DraftType, UploadManager } from "@webpack/common";

import { settings } from "../settings";
import { formatUrlForChat, getErrorMessage, logger, Native, sendTextToChat, showToast } from "../utils";

export async function uploadFileCustomWithStreaming(file: File, channelId: string): Promise<void> {
    logger.info(`[Custom] Starting upload for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    const fileFormName = settings.store.customUploaderFileFormName || "file";
    const responseType = settings.store.customUploaderResponseType;

    let customArgs: Record<string, string>;
    try {
        customArgs = JSON.parse(settings.store.customUploaderArgs || "{}");
    } catch (e) {
        throw new Error(`Failed to parse custom uploader arguments: ${e}`);
    }

    let customHeaders: Record<string, string>;
    try {
        const parsedHeaders = JSON.parse(settings.store.customUploaderHeaders || "{}");
        customHeaders = Object.entries(parsedHeaders).reduce((acc, [key, value]) => {
            if (key && typeof key === "string" && key.trim() !== "") {
                acc[key] = String(value);
            }
            return acc;
        }, {} as Record<string, string>);
    } catch (e) {
        throw new Error(`Failed to parse custom uploader headers: ${e}`);
    }

    const urlPathString = settings.store.customUploaderURL || "";
    let urlPath: string[] = [];

    if (urlPathString.includes("://")) {
        try {
            const baseUrl = new URL(urlPathString);
            urlPath = baseUrl.pathname.split("/").filter(segment => segment);
        } catch (e) {
            throw new Error(`Invalid custom uploader URL: ${urlPathString}`);
        }
    } else {
        urlPath = urlPathString.split(".").filter(segment => segment);
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const finalUrl = await Native.uploadFileCustomNative(
            settings.store.customUploaderRequestURL,
            arrayBuffer,
            file.name,
            file.type,
            fileFormName,
            customArgs,
            customHeaders,
            responseType,
            urlPath
        );

        const finalUrlForChat = formatUrlForChat(file.name, finalUrl);

        setTimeout(() => sendTextToChat(`${finalUrlForChat} `), 10);
        showToast(`${file.name} Successfully Uploaded with Custom Uploader!`, "success");
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    } catch (nativeError) {
        throw new Error(`Custom streaming upload failed: ${getErrorMessage(nativeError)}`);
    }
}
