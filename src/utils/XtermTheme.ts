import { ITheme } from "@xterm/xterm";

const SolarizedDark: ITheme = {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#6c71c4',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3'
};
const OneDark: ITheme = {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    black: '#000000',
    red: '#c62f37',
    green: '#37be78',
    yellow: '#e2e822',
    blue: '#396ec7',
    magenta: '#b835bc',
    cyan: '#3ba7cc',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#e94a51',
    brightGreen: '#45d38a',
    brightYellow: '#f2f84a',
    brightBlue: '#4e8ae9',
    brightMagenta: '#d26ad6',
    brightCyan: '#49b7da',
    brightWhite: '#ffffff',
};
const Nord: ITheme = {
    background: '#2E3440',
    foreground: '#D8DEE9',
    cursor: '#D8DEE9',
    black: '#3B4252',
    red: '#BF616A',
    green: '#A3BE8C',
    yellow: '#EBCB8B',
    blue: '#81A1C1',
    magenta: '#B48EAD',
    cyan: '#88C0D0',
    white: '#E5E9F0',
    brightBlack: '#4C566A',
    brightRed: '#BF616A',
    brightGreen: '#A3BE8C',
    brightYellow: '#EBCB8B',
    brightBlue: '#81A1C1',
    brightMagenta: '#B48EAD',
    brightCyan: '#8FBCBB',
    brightWhite: '#ECEFF4',
};
const Gruvbox: ITheme = {
    background: '#282828',
    foreground: '#ebdbb2',
    cursor: '#ebdbb2',
    black: '#282828',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#a89984',
    brightBlack: '#928374',
    brightRed: '#fb4934',
    brightGreen: '#b8bb26',
    brightYellow: '#fabd2f',
    brightBlue: '#83a598',
    brightMagenta: '#d3869b',
    brightCyan: '#8ec07c',
    brightWhite: '#ebdbb2',
};

export default {
    _ths: {
        'SolarizedDark': SolarizedDark,
        'OneDark': OneDark,
        'Nord': Nord,
        'Gruvbox': Gruvbox
    },
    getTheme(name) {
        return this._ths[name]
    },
    themes: {
        SolarizedDark: 'SolarizedDark',
        OneDark: 'OneDark',
        Nord: 'Nord',
        Gruvbox: 'Gruvbox'
    }
}
