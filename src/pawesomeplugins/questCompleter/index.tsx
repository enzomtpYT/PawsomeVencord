/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByCode, findByProps, findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildChannelStore, RestAPI, showToast, Text } from "@webpack/common";

const FLUX_EVENTS = {
    RUNNING_GAMES: "RUNNING_GAMES_CHANGE",
    QUESTS_HEARTBEAT: "QUESTS_SEND_HEARTBEAT_SUCCESS"
} as const;

const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");
const questAssetsBaseUrl = "https://cdn.discordapp.com/quests/";

interface RunningQuest {
    interval?: NodeJS.Timeout;
    cleanup?: () => void;
    questId: string;
    applicationName: string;
    questName: string;
    taskName: string;
    gameInstance?: any;
    progressInterval?: NodeJS.Timeout;
}

const runningQuests = new Map<string, RunningQuest>();
const isApp = navigator.userAgent.includes("Electron/");

function getQuestById(questId: string) {
    const QuestsStore = findByProps("getQuest");
    return QuestsStore.quests.get(questId);
}

function getLeftQuests() {
    const QuestsStore = findByProps("getQuest");
    return [...QuestsStore.quests.values()].find(quest =>
        quest.userStatus?.enrolledAt &&
        !quest.userStatus?.completedAt &&
        new Date(quest.config?.expiresAt).getTime() > Date.now()
    );
}

function encodeStreamKey(e): string {
    const { streamType: t, guildId: n, channelId: r, ownerId: s } = e;
    switch (t) {
        case "guild":
            if (!n) throw new Error("guildId is required for streamType GUILD");
            return [t, n, r, s].join(":");
        case "call":
            return [t, r, s].join(":");
        default:
            throw new Error("Unknown stream type ".concat(t));
    }
}

function stopQuest(questId: string) {
    const questData = runningQuests.get(questId);
    if (!questData) return;

    console.log("[Quest] Stopping quest:", questData.questName);

    if (questData.interval) {
        clearInterval(questData.interval);
        console.log("[Quest] Cleared main interval");
    }
    if (questData.progressInterval) {
        clearInterval(questData.progressInterval);
        console.log("[Quest] Cleared progress interval");
    }

    if (questData.cleanup) {
        console.log("[Quest] Executing cleanup");
        questData.cleanup();
    }

    runningQuests.delete(questId);
    console.log("[Quest] Removed from tracking");

    showNotification({
        title: "Quest Stopped",
        body: `Stopped ${questData.questName}`,
        icon: `${questAssetsBaseUrl}${questId}/dark/${getQuestById(questId)?.config?.assets?.logotype}`,
    });
}

function getQuestImageConfig(questId: string) {
    const quest = getQuestById(questId);
    return {
        icon: `${questAssetsBaseUrl}${questId}/dark/${quest.config.assets.logotype}`,
        image: `${questAssetsBaseUrl}${questId}/${quest.config.assets.hero}`
    };
}

export default definePlugin({
    name: "QuestCompleter",
    description: "Auto complete quests without any requirements.",
    authors: [Devs.Loukious],
    patches: [
        {
            find: "id:\"share-link\"",
            replacement: {
                match: /\(0,(\w{1,3})\.(\w{1,3})\)\((\w{1,3})\.(\w{1,3}),\{id:"share-link"[^}]+}\)/,
                replace: '$&, (0,$1.$2)($3.$4, { id: "Auto-complete", label: "Auto Complete", action: () => { $self.openCompleteQuest(e.quest.id); } })'
            }
        }
    ],

    settingsAboutComponent() {
        return (
            <>
                {isApp ? (
                    <Text variant="text-lg/bold">
                        The plugin should work properly because you are on the Desktop Client.
                    </Text>
                ) : (
                    <Text variant="text-lg/bold" style={{ color: "red" }}>
                        Error: This plugin only works for non-video quests in the browser.
                    </Text>
                )}
                <div style={{ marginTop: "10px" }}>
                    <Text variant="text-md/bold">Currently running quests:</Text>
                    {Array.from(runningQuests.values()).map(quest => (
                        <div key={quest.questId} style={{ display: "flex", alignItems: "center", marginTop: "5px" }}>
                            <Text>{quest.questName} ({quest.taskName})</Text>
                            <button
                                onClick={() => stopQuest(quest.questId)}
                                style={{ marginLeft: "10px", padding: "2px 5px" }}
                            >
                                Stop
                            </button>
                        </div>
                    ))}
                </div>
            </>
        );
    },

    start() { },

    stop() {
        runningQuests.forEach(quest => {
            if (quest.interval) clearInterval(quest.interval);
            if (quest.cleanup) quest.cleanup();
        });
        runningQuests.clear();
    },

    async openCompleteQuest(questId?: string) {
        var quest = questId ? getQuestById(questId) : getLeftQuests();
        if (!quest) {
            showToast("No active quest found!");
            return;
        }

        // Changed to stop if already running
        if (runningQuests.has(quest.id)) {
            stopQuest(quest.id);
            return;
        }

        const currentStream = ApplicationStreamingStore.getCurrentUserActiveStream();
        const taskName = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"].find(
            x => quest.config.taskConfigV2.tasks[x] != null
        );

        if (quest.userStatus?.completedAt) {
            showToast("This quest is already completed!");
            return;
        }

        if (new Date(quest.config.expiresAt).getTime() < Date.now()) {
            showToast("This quest has expired!");
            return;
        }

        if (!taskName) {
            showToast("Unsupported quest type!");
            return;
        }

        if (!quest.userStatus?.enrolledAt) {
            showToast("Attempting to enroll in quest...");
            const res = await RestAPI.post({
                url: `/quests/${quest.id}/enroll`,
                body: {
                    location: 11,
                    is_targeted: false
                }
            });
            if (res.status !== 200) {
                if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
                    showToast("You need to start playing the video first, then pause it or accept the quest!");
                } else {
                    showToast("Failed to auto enroll in the quest. Please try manually.");
                }
                return;
            } else {
                showToast("Successfully auto enrolled in the quest!");
                await new Promise(r => setTimeout(r, 2000));
                quest = questId ? getQuestById(questId) : getLeftQuests();
            }
        }

        try {
            if (taskName === "STREAM_ON_DESKTOP") {
                if (!currentStream) {
                    showToast("You need to be streaming to complete this quest!");
                    return;
                }

                const viewerIds = ApplicationStreamingStore.getViewerIds(encodeStreamKey(currentStream));
                if (!viewerIds?.length) {
                    showToast("You need at least one viewer in your stream!");
                    return;
                }
            }

            if (taskName === "PLAY_ON_DESKTOP" && !isApp) {
                showToast("Desktop app required for gameplay quests!");
                return;
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : "An unknown error occurred");
            return;
        }

        const applicationId = quest.config.application.id;
        const applicationName = quest.config.application.name;
        const { questName } = quest.config.messages;
        const secondsNeeded = quest.config.taskConfigV2.tasks[taskName].target;
        const secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
        const questsHeartbeat = findByCode("QUESTS_HEARTBEAT");
        const questsVideoProgress = findByCode("QUESTS_VIDEO_PROGRESS");
        const RunningGameStore = findStoreLazy("RunningGameStore");

        const runningQuest: RunningQuest = {
            questId: quest.id,
            applicationName,
            questName,
            taskName
        };
        runningQuests.set(quest.id, runningQuest);

        const showQuestNotification = (title: string, body: string) => {
            showNotification({
                title: `${questName} - ${title}`,
                body: `${body}`,
                ...getQuestImageConfig(quest.id)
            });
        };

        if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
            const tolerance = 7, speed = 10;
            const enrolledAt = quest.userStatus?.enrolledAt
                ? new Date(quest.userStatus.enrolledAt).getTime()
                : Date.now() - 20 * 1000;

            const diff = Math.floor((Date.now() - enrolledAt) / 1000);
            const startingPoint = Math.min(Math.max(Math.ceil(secondsDone), diff), secondsNeeded);
            const startTime = Date.now();

            console.log(`[Quest] Starting ${taskName}: ${questName} at ${startingPoint}/${secondsNeeded}s`);

            const updateProgress = async () => {
                const elapsed = (Date.now() - startTime) / 1000;
                const currentProgress = Math.min(
                    secondsNeeded,
                    startingPoint + elapsed * (speed / tolerance)
                );

                console.log(`[Quest] Progress: ${currentProgress.toFixed(1)}s`);

                try {
                    const res = await RestAPI.post({
                        url: `/quests/${quest.id}/video-progress`,
                        body: { timestamp: currentProgress }
                    });

                    if (res.status === 400) {
                        console.warn(`[Quest] Server rejected progress (${currentProgress.toFixed(1)}s). Retrying...`);
                        return; // don't advance, retry on next interval
                    }

                    if (res.body?.completed_at || currentProgress >= secondsNeeded) {
                        console.log("[Quest] Completing quest");
                        clearInterval(runningQuest.interval);
                        runningQuests.delete(quest.id);
                        showQuestNotification("Completed", "Quest finished!");
                        return;
                    }

                    showQuestNotification(
                        "Progress",
                        `${Math.floor(currentProgress)}/${secondsNeeded}s (${Math.floor(currentProgress / secondsNeeded * 100)}%)`
                    );

                } catch (error) {
                    console.error("[Quest] Error:", error);
                    runningQuests.delete(quest.id);
                    clearInterval(runningQuest.interval);
                }
            };

            // Start loop
            updateProgress();
            runningQuest.interval = setInterval(updateProgress, tolerance * 1000);

            showQuestNotification(
                "Starting",
                `Auto-completing in ~${Math.ceil((secondsNeeded - startingPoint) / speed * tolerance)}s`
            );

        } else if (taskName === "PLAY_ON_DESKTOP") {
            if (!isApp) {
                showToast("Desktop app required for gameplay quests!");
                runningQuests.delete(quest.id);
                return;
            }

            try {
                const res = await RestAPI.get({ url: `/applications/public?application_ids=${applicationId}` });
                const appData = res.body[0];
                const exeName = appData.executables.find(x => x.os === "win32").name.replace(">", "");
                const pid = Math.floor(Math.random() * 30000) + 1000;

                const fakeGame = {
                    cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
                    exeName: exeName,
                    exePath: `C:\\Program Files\\${appData.name}\\${exeName}`,
                    hidden: false,
                    isLauncher: false,
                    id: applicationId,
                    name: appData.name,
                    pid: pid,
                    pidPath: [pid],
                    processName: appData.name,
                    start: Date.now(),
                };

                runningQuest.gameInstance = fakeGame;

                FluxDispatcher.dispatch({
                    type: FLUX_EVENTS.RUNNING_GAMES,
                    added: [fakeGame],
                    removed: [],
                    games: [...RunningGameStore.getRunningGames(), fakeGame]
                });

                showNotification({
                    title: `${questName} Started`,
                    body: `Tracking ${appData.name} gameplay`,
                    ...getQuestImageConfig(quest.id)
                });

                const getCurrentProgress = () => {
                    const currentQuest = getQuestById(quest.id);
                    if (!currentQuest) return 0;

                    return quest.config.configVersion === 1
                        ? currentQuest.userStatus?.streamProgressSeconds || 0
                        : currentQuest.userStatus?.progress?.[taskName]?.value || 0;
                };

                const sendHeartbeat = async () => {
                    try {
                        await RestAPI.post({
                            url: `/quests/${quest.id}/heartbeat`,
                            body: {
                                stream_key: null,
                                terminal: false,
                                metadata: {
                                    game: {
                                        name: appData.name,
                                        pid: pid,
                                        start: fakeGame.start
                                    }
                                }
                            }
                        });
                    } catch (e) {
                        console.error("Heartbeat failed:", e);
                    }
                };

                const updateProgress = async () => {
                    await sendHeartbeat();
                    const progress = getCurrentProgress();
                    const percent = Math.floor((progress / secondsNeeded) * 100);

                    showQuestNotification(
                        "Progress",
                        `${Math.floor(progress / 60)}m/${Math.floor(secondsNeeded / 60)}m (${percent}%)`
                    );

                    if (progress >= secondsNeeded) {
                        clearInterval(runningQuest.progressInterval!);
                        await sendHeartbeat();
                        runningQuests.delete(quest.id);
                        showQuestNotification("Completed", "Quest finished!");
                    }
                };

                await updateProgress();

                runningQuest.progressInterval = setInterval(updateProgress, 30000);

                runningQuest.cleanup = () => {
                    clearInterval(runningQuest.progressInterval!);
                    FluxDispatcher.dispatch({
                        type: FLUX_EVENTS.RUNNING_GAMES,
                        added: [],
                        removed: [fakeGame],
                        games: RunningGameStore.getRunningGames().filter(g => g.pid !== fakeGame.pid)
                    });
                };

            } catch (error) {
                console.error("Game setup error:", error);
                runningQuests.delete(quest.id);
                showToast("Failed to setup game tracking");
            }
        } else if (taskName === "STREAM_ON_DESKTOP") {
            if (!isApp) {
                showToast("Desktop app required for streaming quests!");
                runningQuests.delete(quest.id);
                return;
            }

            const pid = Math.floor(Math.random() * 30000) + 1000;
            const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
                id: applicationId,
                pid,
                sourceName: null
            });

            const startTime = Date.now();

            runningQuest.progressInterval = setInterval(async () => {
                if (!runningQuests.has(quest.id)) return;

                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const progress = Math.min(elapsed, secondsNeeded);

                try {
                    await RestAPI.post({
                        url: `/quests/${quest.id}/heartbeat`,
                        body: { stream_key: encodeStreamKey(currentStream), terminal: false }
                    });

                    showQuestNotification(
                        "Progress",
                        `${Math.floor(progress / 60)}m/${Math.floor(secondsNeeded / 60)}m`
                    );

                    if (progress >= secondsNeeded) {
                        clearInterval(runningQuest.progressInterval!);
                        runningQuests.delete(quest.id);
                        showQuestNotification("Completed", "Quest finished!");
                    }
                } catch (e) {
                    console.error("Stream progress error:", e);
                }
            }, 30000);

            runningQuest.cleanup = () => {
                clearInterval(runningQuest.progressInterval!);
                ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
            };

            showQuestNotification(
                "Starting",
                `Spoofing stream. Stream any window in VC for ${Math.ceil((secondsNeeded - secondsDone) / 60)} minutes.`
            );
        } else if (taskName === "PLAY_ACTIVITY") {
            const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ??
                (Object.values(GuildChannelStore.getAllGuilds()) as any[])
                    .find(x => x?.VOCAL?.length > 0)?.VOCAL?.[0].channel?.id ?? null;
            const streamKey = `call:${channelId}:1`;

            const startTime = Date.now();

            runningQuest.progressInterval = setInterval(async () => {
                if (!runningQuests.has(quest.id)) return;

                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const progress = Math.min(elapsed, secondsNeeded);

                try {
                    const res = await questsHeartbeat({ questId: quest.id, streamKey, terminal: false });
                    showQuestNotification(
                        "Progress",
                        `${Math.floor(progress / 60)}m/${Math.floor(secondsNeeded / 60)}m (${Math.floor(progress / secondsNeeded * 100)}%)`
                    );

                    if (progress >= secondsNeeded) {
                        clearInterval(runningQuest.progressInterval!);
                        await questsHeartbeat({ questId: quest.id, stream_key: streamKey, terminal: true });
                        runningQuests.delete(quest.id);
                        showQuestNotification("Completed", "Quest finished!");
                    }
                } catch (error) {
                    console.error("Activity progress error:", error);
                    runningQuests.delete(quest.id);
                }
            }, 20000);

            runningQuest.cleanup = () => {
                clearInterval(runningQuest.progressInterval!);
            };

            showQuestNotification("Starting", "Completing activity quest");
        }
    }
});
