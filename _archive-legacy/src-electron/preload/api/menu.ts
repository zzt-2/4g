import { ipcRenderer } from 'electron';

export const menuAPI = {
  setMenuBarVisibility: (visible: boolean) => 
    ipcRenderer.send('set-menu-visibility', visible),
  isMenuBarVisible: () => 
    ipcRenderer.invoke('is-menu-visible'),
};