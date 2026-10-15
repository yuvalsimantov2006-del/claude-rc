// After discharge 4.1 UI: the benefits page, profile, points wizard and their hooks (WS-MODULES).
import {onModuleHook} from './hooks.js';
onModuleHook('view:benefits',bnView);onModuleHook('salaryPoints',()=>'');onModuleHook('alerts',()=>[]);onModuleHook('palette',()=>[]);onModuleHook('depositDefaults',()=>({}));onModuleHook('accountCard',()=>'');function bnView(){return card(head('אחרי השחרור','מענק, פיקדון, נקודות זיכוי ועבודה מועדפת.'))+card(empty('העמוד בבנייה','בקרוב: הערכות ותזכורות.'));}
