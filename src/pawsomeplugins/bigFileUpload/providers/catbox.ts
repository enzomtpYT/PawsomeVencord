/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DraftType, UploadManager } from "@webpack/common";

import { settings } from "../settings";
import { formatUrlForChat, getErrorMessage, logger, Native, sendTextToChat, showToast } from "../utils";

export async function uploadFileToCatboxWithStreaming(file: File, channelId: string): Promise<void> {
    logger.info(`[Catbox] Starting upload for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    const url = "https://catbox.moe/user/api.php";
    const userHash = settings.store.catboxUserHash;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uploadResult = await Native.uploadFileToCatboxNative(
            url,
            arrayBuffer,
            file.name,
            file.type,
            userHash
        );

        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            const finalUrl = formatUrlForChat(file.name, uploadResult);

            setTimeout(() => sendTextToChat(`${finalUrl} `), 10);
            showToast(`${file.name} Successfully Uploaded to Catbox!`, "success");
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            throw new Error(`Catbox upload failed: ${uploadResult}`);
        }
    } catch (nativeError) {
        throw new Error(`Catbox streaming upload failed: ${getErrorMessage(nativeError)}`);
    }
}

export async function uploadFileToLitterboxWithStreaming(file: File, channelId: string): Promise<void> {
    logger.info(`[Litterbox] Starting upload for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    const time = settings.store.litterboxTime;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uploadResult = await Native.uploadFileToLitterboxNative(
            arrayBuffer,
            file.name,
            file.type,
            time
        );

        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            const finalUrl = formatUrlForChat(file.name, uploadResult);

            setTimeout(() => sendTextToChat(`${finalUrl}`), 10);
            showToast(`${file.name} Successfully Uploaded to Litterbox!`, "success");
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            throw new Error(`Litterbox upload failed: ${uploadResult}`);
        }
    } catch (nativeError) {
        throw new Error(`Litterbox streaming upload failed: ${getErrorMessage(nativeError)}`);
    }
}
