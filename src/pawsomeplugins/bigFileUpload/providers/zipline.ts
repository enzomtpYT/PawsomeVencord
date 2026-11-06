/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DraftType, UploadManager } from "@webpack/common";

import { settings } from "../settings";
import { formatUrlForChat, getErrorMessage, logger, Native, sendTextToChat, showToast } from "../utils";

export async function uploadFileToZiplineWithStreaming(file: File, channelId: string): Promise<void> {
    logger.info(`[Zipline] Starting upload for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    const authToken = settings.store.ziplineAuthToken;
    const serverURL = settings.store.ziplineServerURL || "https://share.enzomtp.party/api/upload";
    const folder = settings.store.ziplineFolder;
    const deleteAfter = settings.store.ziplineDeleteAfter;

    if (!authToken || authToken.trim() === "") {
        throw new Error("Zipline authorization token is required");
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uploadResult = await Native.uploadFileToZiplineNative(
            serverURL,
            arrayBuffer,
            file.name,
            file.type,
            authToken,
            folder,
            deleteAfter
        );

        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            const finalUrl = formatUrlForChat(file.name, uploadResult);

            setTimeout(() => sendTextToChat(`${finalUrl} `), 10);
            showToast(`${file.name} Successfully Uploaded to Zipline!`, "success");
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            throw new Error(`Zipline upload failed: ${uploadResult}`);
        }
    } catch (nativeError) {
        throw new Error(`Zipline streaming upload failed: ${getErrorMessage(nativeError)}`);
    }
}
