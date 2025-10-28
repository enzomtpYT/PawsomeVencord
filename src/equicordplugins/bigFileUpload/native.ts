/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * GoFile upload
 */
export async function uploadFileToGofileNative(_, url: string, fileBuffer: ArrayBuffer, fileName: string, fileType: string, token?: string): Promise<string> {
    try {
        console.log(`[GoFile] Starting upload of ${fileName} (${fileBuffer.byteLength} bytes)`);

        const formData = new FormData();
        const mime = pickBestMime(fileType, fileName);
        const blob = new Blob([fileBuffer], { type: mime });
        formData.append("file", new File([blob], fileName, { type: mime }));

        if (token) {
            formData.append("token", token);
        }

        const response = await fetch(url, {
            method: "POST",
            body: formData,
        });

        const result = await response.json();
        console.log("[GoFile] Upload completed successfully");
        return result;
    } catch (error) {
        console.error("Error during GoFile upload:", error);
        throw error;
    }
}

/**
 * Catbox upload
 */
export async function uploadFileToCatboxNative(_, url: string, fileBuffer: ArrayBuffer, fileName: string, fileType: string, userHash: string): Promise<string> {
    try {
        console.log(`[Catbox] Starting upload of ${fileName} (${fileBuffer.byteLength} bytes)`);

        const formData = new FormData();
        formData.append("reqtype", "fileupload");

        const mime = pickBestMime(fileType, fileName);
        const blob = new Blob([fileBuffer], { type: mime });
        formData.append("fileToUpload", new File([blob], fileName, { type: mime }));
        formData.append("userhash", userHash);

        const response = await fetch(url, {
            method: "POST",
            body: formData,
        });

        const result = await response.text();
        console.log("[Catbox] Upload completed successfully");
        return result;
    } catch (error) {
        console.error("Error during Catbox upload:", error);
        throw error;
    }
}

/**
 * Litterbox upload
 */
export async function uploadFileToLitterboxNative(_, fileBuffer: ArrayBuffer, fileName: string, fileType: string, time: string): Promise<string> {
    try {
        console.log(`[Litterbox] Starting upload of ${fileName} (${fileBuffer.byteLength} bytes)`);

        const formData = new FormData();
        formData.append("reqtype", "fileupload");
        const mime = pickBestMime(fileType, fileName);
        const blob = new Blob([fileBuffer], { type: mime });
        formData.append("fileToUpload", new File([blob], fileName, { type: mime }));
        formData.append("time", time);

        const response = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
            method: "POST",
            body: formData,
        });

        const result = await response.text();
        console.log("[Litterbox] Upload completed successfully");
        return result;
    } catch (error) {
        console.error("Error during Litterbox upload:", error);
        throw error;
    }
}

/**
 * Zipline upload
 */
export async function uploadFileToZiplineNative(_, url: string, fileBuffer: ArrayBuffer, fileName: string, fileType: string, authToken: string, folder?: string, deleteAfter?: string): Promise<string> {
    try {
        console.log(`[Zipline] Starting upload of ${fileName} (${fileBuffer.byteLength} bytes) to ${url}`);

        const formData = new FormData();
        const mime = pickBestMime(fileType, fileName);
        const blob = new Blob([fileBuffer], { type: mime });
        formData.append("file", new File([blob], fileName, { type: mime }));

        const headers: Record<string, string> = {
            "authorization": authToken
        };

        if (folder && folder.trim() !== "") {
            headers["x-zipline-folder"] = folder;
        }

        if (deleteAfter && deleteAfter.trim() !== "") {
            headers["x-zipline-delete-after"] = deleteAfter;
        }

        const response = await fetch(url, {
            method: "POST",
            body: formData,
            headers: new Headers(headers)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("[Zipline] Upload completed successfully");

        // Zipline returns files array with URL in each file object
        if (result.files && result.files.length > 0 && result.files[0].url) {
            return result.files[0].url;
        }

        throw new Error("Zipline response missing file URL");
    } catch (error) {
        console.error("Error during Zipline upload:", error);
        throw error;
    }
}

/**
 * Custom upload
 */
export async function uploadFileCustomNative(_, url: string, fileBuffer: ArrayBuffer, fileName: string, fileType: string, fileFormName: string, customArgs: Record<string, string>, customHeaders: Record<string, string>, responseType: string, urlPath: string[]): Promise<string> {
    try {
        console.log(`[Custom] Starting upload of ${fileName} (${fileBuffer.byteLength} bytes) to ${url}`);

        const formData = new FormData();
        const mime = pickBestMime(fileType, fileName);
        const blob = new Blob([fileBuffer], { type: mime });
        formData.append(fileFormName, new File([blob], fileName, { type: mime }));

        // Filter out empty keys to prevent "Field name missing" error
        for (const [key, value] of Object.entries(customArgs)) {
            if (key && key.trim() !== "") {
                formData.append(key, value);
            }
        }

        // Prepare headers (remove Content-Type as FormData sets it automatically)
        const headers = { ...customHeaders };
        delete headers["Content-Type"];
        delete headers["content-type"];

        const uploadResponse = await fetch(url, {
            method: "POST",
            body: formData,
            headers: new Headers(headers)
        });

        if (!uploadResponse.ok) {
            throw new Error(`HTTP error! status: ${uploadResponse.status}, statusText: ${uploadResponse.statusText}`);
        }

        let uploadResult;
        if (responseType === "JSON") {
            uploadResult = await uploadResponse.json();
        } else {
            uploadResult = await uploadResponse.text();
        }

        let finalUrl = "";
        if (responseType === "JSON") {
            let current = uploadResult;
            for (const key of urlPath) {
                if (current[key] === undefined) {
                    throw new Error(`Invalid URL path: ${urlPath.join(".")}`);
                }
                current = current[key];
            }
            finalUrl = current;
        } else {
            finalUrl = uploadResult.trim();
        }

        console.log("[Custom] Upload completed successfully");
        return finalUrl;
    } catch (error) {
        console.error("Error during Custom upload:", error);
        throw error;
    }
}

// --- Helpers ---
function pickBestMime(inputType: string, fileName: string): string {
    const cleaned = (inputType || "").trim().toLowerCase();
    if (cleaned && cleaned !== "application/octet-stream") return cleaned;
    const inferred = inferMimeFromFilename(fileName);
    return inferred || "application/octet-stream";
}

function inferMimeFromFilename(fileName: string): string {
    const idx = fileName.lastIndexOf(".");
    const ext = idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : "";
    switch (ext) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        case "bmp":
            return "image/bmp";
        case "svg":
            return "image/svg+xml";
        case "heic":
            return "image/heic";
        case "heif":
            return "image/heif";
        case "mp4":
            return "video/mp4";
        case "webm":
            return "video/webm";
        case "mkv":
            return "video/x-matroska";
        case "mov":
            return "video/quicktime";
        case "mp3":
            return "audio/mpeg";
        case "wav":
            return "audio/wav";
        case "flac":
            return "audio/flac";
        case "ogg":
            return "audio/ogg";
        case "m4a":
            return "audio/mp4";
        case "txt":
            return "text/plain";
        case "md":
            return "text/markdown";
        case "json":
            return "application/json";
        case "pdf":
            return "application/pdf";
        case "zip":
            return "application/zip";
        case "rar":
            return "application/vnd.rar";
        case "7z":
            return "application/x-7z-compressed";
        case "gz":
            return "application/gzip";
        case "tar":
            return "application/x-tar";
        default:
            return "";
    }
}
