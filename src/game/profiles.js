const base={face:'relaxed',build:'athletic',bottom:'#eee3ce',outfit:'shorts',hat:'none',accessory:'none',input:'keyboard'};
export const PRESETS=[
  {...base,id:'maya',name:'Maya',skin:'#8d5237',hair:'#241c19',hairStyle:'curls',top:'#158b8b',bottom:'#243650',outfit:'trousers',build:'slim'},
  {...base,id:'kai',name:'Kai',skin:'#dfaf84',hair:'#201d1b',hairStyle:'crop',top:'#f3e9d5',bottom:'#24425e',face:'sharp'},
  {...base,id:'amir',name:'Amir',skin:'#ad7750',hair:'#2c211c',hairStyle:'curls',top:'#d77b62',accessory:'beard',face:'sharp'},
  {...base,id:'zoe',name:'Zoe',skin:'#f1c5a4',hair:'#a74924',hairStyle:'ponytail',top:'#253c60',outfit:'skort',build:'slim'},
  {...base,id:'leo',name:'Leo',skin:'#67412f',hair:'#241b1a',hairStyle:'twists',top:'#477bb4',build:'strong',accessory:'beard'},
  {...base,id:'val',name:'Val',skin:'#bf8c63',hair:'#3c2b20',hairStyle:'undercut',top:'#8d9e83',face:'sharp',accessory:'earrings'},
];
export const SKIN_COLORS=['#f4d4bc','#e7ba98','#d49c75','#bc855e','#a16a48','#8d5237','#67412f','#452d25'];
export const HAIR_COLORS=['#201d1b','#503322','#8c5a33','#c69249','#a74924','#d9cfbd'];
export const TOP_COLORS=['#253c60','#158b8b','#f3e9d5','#d77b62','#8d9e83','#477bb4','#a982b0','#272b32'];
export function validProfile(p){return p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=24&&['skin','hair','top','bottom'].every(k=>/^#[0-9a-f]{6}$/i.test(p[k]))&&['crop','curls','ponytail','twists','bob','undercut'].includes(p.hairStyle)&&['relaxed','sharp'].includes(p.face)&&['slim','athletic','strong'].includes(p.build)&&['shorts','trousers','skort'].includes(p.outfit)&&['none','cap','visor'].includes(p.hat)&&['none','glasses','earrings','beard'].includes(p.accessory);}
