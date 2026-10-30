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

import { Button, ButtonProps } from "@components/Button";
import { classes } from "@utils/misc";
import React, { JSX } from "react";

import { panelClasses } from "../../../philsPluginLibrary";

export type IconComponent = <T extends { className: string; }>(props: T) => JSX.Element;
export interface SettingsPanelButtonProps extends ButtonProps {
    icon?: IconComponent;
}

export const SettingsPanelButton = ({ icon: Icon, size = "small", ...props }: SettingsPanelButtonProps) => {
    return (
        <Button
            size={size}
            className={classes(panelClasses.button, panelClasses.buttonColor)}
            {...props}
        >
            <div className={classes(panelClasses.buttonContents)}>
                {Icon && <Icon className={classes(panelClasses.buttonIcon)} />}
            </div>
        </Button>
    );
};
