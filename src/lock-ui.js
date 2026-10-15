// App lock 4.1 UI: lock screen, PIN and biometrics setup, auto-lock and the honest wipe (WS-MODULES).
import {onModuleHook} from './hooks.js';
onModuleHook('boot',()=>{});onModuleHook('locked',()=>false);onModuleHook('privateNotifications',()=>false);onModuleHook('settings',()=>'');onModuleHook('palette',()=>[]);
