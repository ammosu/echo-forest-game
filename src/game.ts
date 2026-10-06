import Phaser from 'phaser';
import background from '../assets/generated/forest-background.png?url';
import anboHost from '../assets/sprites/1x/anbo.png?url';
import anboHostBlink from '../assets/sprites/1x/anbo_blink.png?url';
import owlUp from '../assets/sprites/extras/owl_flag_up.png?url';
import owlDown from '../assets/sprites/extras/owl_flag_down.png?url';

export type Best = { notes: number; seconds: number };
export type GameEvent =
  | { type: 'ready' | 'reset' | 'checkpoint' }
  | { type: 'error' | 'hint'; message: string }
  | { type: 'tick'; seconds: number; notes: number; total: number }
  | { type: 'health'; lives: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'end'; won: boolean; notes: number; total: number; seconds: number; best?: Best };
const WIDTH = 3264, FLOOR = 304;
export const groundSpans = [[0, 700], [815, 1500], [1640, 2290], [2440, WIDTH]];
/** Bramble patches on the ground: touching them hurts, so they must be jumped. */
export const thornSpans = [[1165, 1215], [2735, 2785]];
const enemyPatrols = [[1255,1340],[1380,1450],[2035,2230],[2610,2670],[2820,2940]];
const growerPositions = [[360,290],[1765,290]];
const notePositions = [
  [180,267],[285,227],[415,267],[528,203],[610,203],[749,210],
  [874,262],[1000,229],[1100,155],[1210,185],[1380,260],[1570,205],
  [1750,254],[1870,217],[1980,183],[2160,257],[2370,205],
  [2570,227],[2770,197],[3040,263],
];
type Controls = { left: boolean; right: boolean; jump: boolean };
// Side-view frames for every mascot: assets/sprites/side/<id>_<run_a|run_b|stand>.png (tools/mascots/side.py).
const sideFrames = import.meta.glob('../assets/sprites/side/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const playableIds = [...new Set(Object.keys(sideFrames).map(path => path.split('/').pop()!.replace(/_(run_a|run_b|stand)\.png$/, '')))];
/** Owl waits at the finish line; when Owl is the hero, Anbo takes the host spot. */
export const hostOf = (id: string) => id === 'owl' ? 'anbo' : 'owl';
export type Look = 'standard' | 'hd2d';
class ForestScene extends Phaser.Scene {
  owner: ForestGame;
  player!: Phaser.Physics.Arcade.Sprite;
  owl!: Phaser.GameObjects.Sprite;
  flags!: Phaser.GameObjects.Graphics;
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  /** Thin branches: one-way, solid only from above so jumps pass up through them. */
  ledges!: Phaser.Physics.Arcade.StaticGroup;
  growers: Phaser.GameObjects.Image[] = [];
  big = false; sizeSteps?: Phaser.Time.TimerEvent;
  notes!: Phaser.Physics.Arcade.StaticGroup;
  enemies!: Phaser.Physics.Arcade.Group;
  mushroom!: Phaser.Physics.Arcade.Image;
  moving!: Phaser.Physics.Arcade.Image;
  cursor!: Record<string, Phaser.Input.Keyboard.Key>;
  worldArt!: Phaser.GameObjects.Graphics;
  effects!: Phaser.GameObjects.Graphics;
  motes!: Phaser.GameObjects.Graphics;
  backdrop!: Phaser.GameObjects.Image;
  shafts!: Phaser.GameObjects.Graphics;
  warmth!: Phaser.GameObjects.Rectangle;
  particles: { x:number; y:number; vx:number; vy:number; life:number; color:number; size?:number }[] = [];
  rings: { x:number; y:number; life:number; color:number; size?:number }[] = [];
  hitstopUntil=0; noteChain=0; lastNoteAt=-10000; zoomTween?:Phaser.Tweens.Tween;
  seconds = 0; notesCollected = 0; lives = 3; checkpoint = false;
  groundedAt = -1000; jumpQueuedAt = -1000; invulnerableUntil = 0;
  prevJump = false; tickAt = 0; simTime = 0; enemyRanges: {obj:Phaser.Physics.Arcade.Sprite; start:number; end:number; direction:number}[] = [];
  ready = false; hasLoadError = false;
  constructor(owner: ForestGame) { super('forest'); this.owner = owner; }
  preload() {
    this.load.image('forest', background); this.load.image('owlUp', owlUp); this.load.image('owlDown', owlDown); this.load.image('anboHost', anboHost); this.load.image('anboHostBlink', anboHostBlink);
    for (const [path, url] of Object.entries(sideFrames)) this.load.image(path.split('/').pop()!.replace('.png', ''), url);
    this.load.on('loaderror', () => { this.hasLoadError = true; this.owner.emit({ type:'error', message:'有素材尚未載入，請確認網路後重新整理。' }); });
  }
  create() {
    if (this.hasLoadError) return;
    this.backdrop=this.add.image(320,160,'forest').setDisplaySize(680,454).setScrollFactor(0).setDepth(-10);
    this.add.rectangle(320,180,640,360,0x174737,.08).setScrollFactor(0).setDepth(-9);
    this.makeTextures();
    this.worldArt = this.add.graphics().setDepth(-1);
    this.effects = this.add.graphics().setDepth(5);
    this.motes = this.add.graphics().setScrollFactor(0).setDepth(-2);
    // HD-2D extras: slanted sun shafts over the backdrop and a warm screen wash.
    this.shafts=this.add.graphics().setScrollFactor(0).setDepth(-3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    for(const [x,w,a] of [[150,60,.07],[300,34,.05],[455,70,.06]]){this.shafts.fillStyle(0xfff0c0,a);this.shafts.fillPoints([{x,y:-20},{x:x+w,y:-20},{x:x+w-150,y:320},{x:x-150-w*.4,y:320}],true);}
    this.warmth=this.add.rectangle(320,240,640,480,0xff9a3c,.035).setScrollFactor(0).setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.platforms = this.physics.add.staticGroup();
    this.ledges = this.physics.add.staticGroup();
    groundSpans.forEach(([start,end]) => this.addPlatform(start,FLOOR,end-start,88,'ground'));
    [[250,276,52,28],[950,276,48,28],[1810,276,52,28],[2530,276,58,28]].forEach(p=>this.addPlatform(p[0],p[1],p[2],p[3],'stump'));
    [[480,244,155,14],[1130,227,124,14],[1910,224,144,14],[2680,240,170,14]].forEach(p=>this.addPlatform(p[0],p[1],p[2],p[3],'branch'));
    this.moving = this.physics.add.image(2135,234,'branch').setDisplaySize(76,14).setImmovable(true);
    const movingBody = this.moving.body as Phaser.Physics.Arcade.Body;
    movingBody.setAllowGravity(false); movingBody.setSize(76,14); movingBody.setFriction(1,0); movingBody.setVelocityX(46);
    Object.assign(movingBody.checkCollision,{down:false,left:false,right:false});
    thornSpans.forEach(([a,b])=>{for(let x=a;x<b;x+=17)this.add.image(x+8,FLOOR-9,'thorn').setDepth(1);});
    this.drawDecor();
    this.notes = this.physics.add.staticGroup();
    notePositions.forEach(([x,y],i) => { const n=this.notes.create(x,y,'note') as Phaser.Physics.Arcade.Image; n.setData('baseY',y); n.setData('index',i); n.setDepth(2); });
    // Grow acorns: Mario-style power-up; while big, one hit only shrinks the hero back.
    this.growers = growerPositions.map(([x,y])=>this.add.image(x,y,'acorn').setDepth(2).setData('baseY',y));
    this.mushroom = this.physics.add.image(1050,293,'mushroom').setImmovable(true);
    (this.mushroom.body as Phaser.Physics.Arcade.Body).setAllowGravity(false).setSize(28,13).setOffset(2,9);
    this.enemies = this.physics.add.group({ allowGravity:false, immovable:true });
    enemyPatrols.forEach(([start,end])=>{
      const obj=this.enemies.create(start,294,'hazard') as Phaser.Physics.Arcade.Sprite;
      obj.setSize(20,15).setOffset(4,6); obj.setDepth(1); this.enemyRanges.push({obj,start,end,direction:1});
    });
    this.player = this.physics.add.sprite(100,FLOOR,this.frame('stand')).setOrigin(.5,1).setDepth(3);
    this.player.setSize(18,34).setOffset(11,14); this.player.setMaxVelocity(190,620);
    this.player.setCollideWorldBounds(false);
    for(const id of playableIds)this.anims.create({key:`${id}_run`,frames:[{key:`${id}_run_a`},{key:`${id}_run_b`}],frameRate:9,repeat:-1});
    this.physics.add.collider(this.player,this.platforms);
    this.physics.add.collider(this.player,this.ledges);
    this.physics.add.collider(this.player,this.moving);
    this.physics.add.collider(this.player,this.mushroom,()=>{
      const body=this.player.body as Phaser.Physics.Arcade.Body;
      if(body.touching.down && this.owner.running && !this.owner.paused) { body.setVelocityY(-490); this.groundedAt=-1000; this.jumpQueuedAt=-1000; this.burst(1050,282,0xffcf86,12); this.owner.tone('bounce'); }
    });
    // Note pickup is checked in update() against the player's visible sprite, not the narrow terrain hitbox.
    this.physics.add.overlap(this.player,this.enemies,(_p,e)=>{
      if(!this.owner.running || this.owner.paused) return;
      const enemy=e as Phaser.Physics.Arcade.Sprite, body=this.player.body as Phaser.Physics.Arcade.Body;
      if(body.velocity.y>80 && body.bottom<enemy.y+2) { enemy.disableBody(true,true); body.setVelocityY(-265); this.burst(enemy.x,enemy.y,0xc3d396,10); this.impact(enemy.x,enemy.y,0xc3d396,'踩到了！','#e4f2c2',2); this.hitstop(80); this.punch(.05,.005); this.owner.tone('bounce'); }
      else this.hurt();
    });
    this.owl=this.add.sprite(3140,FLOOR,this.hostFrame(false)).setOrigin(.5,1).setDepth(2);
    this.flags=this.add.graphics().setDepth(1);
    this.cursor=this.input.keyboard!.addKeys({left:'LEFT',right:'RIGHT',up:'UP',space:'SPACE',a:'A',d:'D',w:'W'},false) as Record<string,Phaser.Input.Keyboard.Key>;
    // Phones get a 4:3 canvas and a closer camera over the same 360px-tall world.
    if(this.owner.compact)this.cameras.main.setZoom(4/3);
    this.cameras.main.setBounds(0,0,WIDTH,360); this.cameras.main.startFollow(this.player,true,.11,.11, -95,0); this.cameras.main.setRoundPixels(true);
    this.physics.world.setBounds(0,0,WIDTH,430);
    this.applyLook();
    this.ready=true; this.physics.pause(); this.drawFlags(); this.owner.emit({type:'ready'}); this.sync();
    if(import.meta.env.DEV) {
      // Read-only diagnostics for browser verification; no teleport or win bypass.
      (window as unknown as {__forest:unknown}).__forest = { snapshot: () => this.snapshot(), hero: () => ({ player: this.player.texture.key, host: this.owl.texture.key }) };
    }
  }
  frame(kind:'run_a'|'run_b'|'stand'){return `${this.owner.character}_${kind}`;}
  hostFrame(up:boolean){return hostOf(this.owner.character)==='owl'?(up?'owlUp':'owlDown'):(up?'anboHostBlink':'anboHost');}
  /** Swap the hero (and the finish host) before a run; textures are all preloaded. */
  applyCharacter(){this.player.anims.stop();this.player.setTexture(this.frame('stand'));this.owl.setTexture(this.hostFrame(false));}
  /** Octopath-style diorama: soft backdrop, crisp sprites, bloom, warm grade, vignette. */
  applyLook() {
    const hd=this.owner.look==='hd2d', cam=this.cameras.main;
    cam.postFX?.clear(); this.backdrop.preFX?.clear();
    this.shafts.setVisible(hd); this.warmth.setVisible(hd);
    if(!hd || this.game.renderer.type!==Phaser.WEBGL)return;
    this.backdrop.preFX?.addBlur(0,1,1,.5);
    const grade=cam.postFX.addColorMatrix();grade.saturate(.12);grade.brightness(1.04,true);
    cam.postFX.addBloom(0xffffff,1,1,.8,1.05,4);
    cam.postFX.addVignette(.5,.5,.92,.32);
  }
  makeTextures() {
    const texture=(name:string,w:number,h:number,draw:(g:Phaser.GameObjects.Graphics)=>void)=>{const g=this.make.graphics({x:0,y:0});draw(g);g.generateTexture(name,w,h);g.destroy();};
    texture('note',18,22,g=>{g.fillStyle(0x4b5234);g.fillRect(10,1,4,17);g.fillRect(2,14,10,7);g.fillStyle(0xffde7a);g.fillRect(10,1,3,15);g.fillRect(3,14,9,5);g.fillRect(13,2,4,4);g.fillStyle(0xfff1b8);g.fillRect(4,14,4,2);});
    texture('acorn',16,18,g=>{g.fillStyle(0x3d2c1b);g.fillRect(7,0,2,3);g.fillRect(2,3,12,6);g.fillRect(3,8,10,8);g.fillRect(5,15,6,3);g.fillStyle(0x8a5a2b);g.fillRect(3,4,10,4);g.fillStyle(0xc28a4a);g.fillRect(4,4,3,2);g.fillStyle(0xffc94a);g.fillRect(4,9,8,6);g.fillRect(6,15,4,2);g.fillStyle(0xfff0a8);g.fillRect(5,10,2,3);});
    texture('thorn',17,18,g=>{g.fillStyle(0x2a2531);g.fillRect(1,8,15,10);g.fillTriangle(0,10,4,0,7,10);g.fillTriangle(6,10,10,2,13,10);g.fillTriangle(11,10,16,1,17,10);g.fillStyle(0x6b4a7a);g.fillRect(2,10,13,6);g.fillTriangle(2,10,4,3,6,10);g.fillTriangle(8,10,10,5,12,10);g.fillStyle(0xd88ad0);g.fillRect(4,3,1,2);g.fillRect(10,5,1,2);g.fillRect(15,3,1,2);g.fillStyle(0x58743f);g.fillRect(0,16,17,2);});
    texture('solid',8,8,g=>{g.fillStyle(0xffffff);g.fillRect(0,0,8,8);});
    texture('branch',76,14,g=>{g.fillStyle(0x342e23);g.fillRect(0,3,76,11);g.fillStyle(0x826448);g.fillRect(2,4,72,6);g.fillStyle(0xad8954);g.fillRect(3,4,69,2);g.fillStyle(0x8cac58);g.fillRect(0,0,76,4);g.fillStyle(0xc1d278);g.fillRect(3,0,70,2);});
    texture('mushroom',32,25,g=>{g.fillStyle(0x29372c);g.fillRect(10,11,14,14);g.fillStyle(0xf4d9a0);g.fillRect(13,10,8,15);g.fillStyle(0x722f30);g.fillRect(0,9,32,7);g.fillRect(4,4,24,7);g.fillRect(9,0,14,5);g.fillStyle(0xd7735d);g.fillRect(2,8,28,6);g.fillRect(7,3,18,7);g.fillStyle(0xffdc9f);g.fillRect(8,5,5,4);g.fillRect(21,9,5,3);});
    texture('hazard',28,23,g=>{g.fillStyle(0x263b32);g.fillRect(2,9,24,12);g.fillRect(5,5,18,15);g.fillRect(8,0,3,9);g.fillRect(15,1,3,8);g.fillRect(22,5,3,7);g.fillStyle(0x728359);g.fillRect(5,8,18,10);g.fillStyle(0xc4c584);g.fillRect(7,7,3,5);g.fillRect(13,6,3,5);g.fillStyle(0xffebba);g.fillRect(18,13,3,3);g.fillStyle(0x172e27);g.fillRect(20,14,1,2);g.fillRect(6,20,5,3);g.fillRect(19,20,5,3);});
  }
  addPlatform(x:number,y:number,w:number,h:number,kind:string) {
    const collider=(kind==='branch'?this.ledges:this.platforms).create(x+w/2,y+h/2,'solid') as Phaser.Physics.Arcade.Image;
    collider.setDisplaySize(w,h).setVisible(false).refreshBody();
    if(kind==='branch')Object.assign((collider.body as Phaser.Physics.Arcade.StaticBody).checkCollision,{down:false,left:false,right:false});
    const g=this.worldArt;
    if(kind==='ground') {
      g.fillStyle(0x26362c);g.fillRect(x,y,w,h);g.fillStyle(0x514835);g.fillRect(x+2,y+9,w-4,h-9);g.fillStyle(0x3b3b2d);g.fillRect(x+3,y+35,w-6,h-35);
      for(let bx=x+4;bx<x+w-8;bx+=17){const n=Math.floor(bx*13)%27;g.fillStyle(n%2?0x6e5d3d:0x78643f);g.fillRect(bx,y+16+n,5,3);g.fillStyle(0x252f28);g.fillRect(bx+5,y+49+n,8,4);}
      g.fillStyle(0x72954e);g.fillRect(x,y,w,9);g.fillStyle(0xb9ce78);g.fillRect(x+1,y,w-2,3);g.fillStyle(0x98b55f);
      for(let bx=x+3;bx<x+w-4;bx+=11){g.fillRect(bx,y-3,4,4);g.fillRect(bx+3,y+7,4,5);}
      g.fillStyle(0x47653c);for(let bx=x+8;bx<x+w;bx+=23)g.fillRect(bx,y+9,5,5);
    } else if(kind==='stump') {
      g.fillStyle(0x332e23);g.fillRect(x,y+3,w,h-3);g.fillStyle(0x795b38);g.fillRect(x+3,y+5,w-6,h-5);g.fillStyle(0xa57d49);g.fillRect(x+4,y+4,w-8,5);g.fillStyle(0xd5b677);g.fillRect(x+2,y,w-4,4);g.fillStyle(0x5c422c);for(let n=10;n<w-4;n+=12)g.fillRect(x+n,y+11,3,h-11);g.fillStyle(0x7c9b50);g.fillRect(x-2,y+2,9,4);
    } else {
      g.fillStyle(0x302f24);g.fillRect(x-2,y+4,w+4,h-4);g.fillStyle(0x896a43);g.fillRect(x,y+4,w,6);g.fillStyle(0xc39e62);g.fillRect(x+2,y+4,w-4,2);g.fillStyle(0x90ad5b);g.fillRect(x-2,y,w+4,4);g.fillStyle(0xc5d781);g.fillRect(x+2,y,w-4,2);
      for(let bx=x+6;bx<x+w;bx+=25){g.fillStyle(0x607c43);g.fillRect(bx,y+h,3,16);g.fillRect(bx-3,y+h+6,6,3);}
    }
  }
  drawDecor() {
    const g=this.worldArt;
    for(const [a,b] of groundSpans) for(let x=a+35;x<b-30;x+=87){
      g.fillStyle(0x75994e);g.fillRect(x,FLOOR-12,2,12);g.fillRect(x+4,FLOOR-9,2,9);g.fillStyle(0xb1c970);g.fillRect(x-2,FLOOR-7,5,2);
      if(x%3===0){g.fillStyle(0xf0d78a);g.fillRect(x-2,FLOOR-14,5,4);g.fillStyle(0xe7a477);g.fillRect(x+10,FLOOR-8,3,3);}
    }
    const sign=(x:number,text:string)=>{g.fillStyle(0x674d32);g.fillRect(x+15,264,5,40);g.fillStyle(0xa07e49);g.fillRect(x,249,44,22);g.fillStyle(0xd1b075);g.fillRect(x+2,251,40,17);this.add.text(x+22,259,text,{fontFamily:'sans-serif',fontSize:'11px',color:'#33472f'}).setOrigin(.5).setDepth(1);};
    sign(135,'→');sign(930,'↑');sign(2980,'→');
    // Small camp lantern and finish arch; no text baked into generated artwork.
    g.fillStyle(0x705736);g.fillRect(1701,244,5,60);g.fillRect(1701,244,26,4);g.fillStyle(0xa79c65);g.fillRect(1718,247,2,10);
    g.fillStyle(0x293d2d);g.fillRect(1712,256,16,20);g.fillStyle(0x749364);g.fillRect(1715,260,10,12);
    g.fillStyle(0x846b45);g.fillRect(3091,208,8,96);g.fillRect(3191,208,8,96);g.fillStyle(0xb59b60);g.fillRect(3086,206,117,10);g.fillStyle(0x94af63);g.fillRect(3083,204,121,4);
    for(let i=0;i<8;i++){g.fillStyle(i%2?0xffde85:0x6f9b72);g.fillTriangle(3100+i*11,217,3110+i*11,217,3105+i*11,230);}
  }
  drawFlags() {
    const g=this.flags;g.clear();g.fillStyle(this.checkpoint?0xffdb77:0x749364);g.fillRect(1715,260,10,12);
    if(this.checkpoint){g.fillStyle(0xffd875,.15);g.fillCircle(1720,266,24);g.fillStyle(0xffecb5);g.fillRect(1718,261,4,7);}
  }
  start() {
    if(!this.ready)return;
    this.owner.running=true;this.owner.paused=false;this.physics.resume();this.seconds=0;this.simTime=0;this.tickAt=0;this.notesCollected=0;this.lives=3;this.checkpoint=false;this.invulnerableUntil=0;this.particles=[];this.rings=[];this.hitstopUntil=0;this.noteChain=0;this.lastNoteAt=-10000;
    this.notes.getChildren().forEach(child=>{const n=child as Phaser.Physics.Arcade.Image;n.enableBody(false,n.x,n.y,true,true);});
    this.growers.forEach(a=>a.setActive(true).setVisible(true));
    this.enemyRanges.forEach(e=>{e.direction=1;e.obj.enableBody(true,e.start,294,true,true);});
    this.moving.setPosition(2135,234);(this.moving.body as Phaser.Physics.Arcade.Body).reset(2135,234);this.moving.setVelocityX(46);
    this.respawn();this.drawFlags();this.cameras.main.scrollX=0;this.owner.emit({type:'reset'});this.owner.emit({type:'health',lives:3});this.owner.emit({type:'pause',paused:false});this.sync();
  }
  respawn() {
    const x=this.checkpoint?1745:100;
    this.setBig(false,false);this.player.setPosition(x,FLOOR);(this.player.body as Phaser.Physics.Arcade.Body).reset(x,FLOOR);this.player.setVelocity(0,0);this.player.setAlpha(1).setAngle(0).setFlipX(false);this.player.anims.stop();this.player.setTexture(this.frame('stand'));
    this.groundedAt=-1000;this.jumpQueuedAt=-1000;this.prevJump=false;this.owner.releaseControls();
  }
  collectNotes() {
    // Player art spans x 5..33 of the 40x48 frame (mirrored when flipped); notes span ~16x20 around their center.
    const k=this.player.scaleY,reach=new Phaser.Geom.Rectangle(this.player.x-14*k,this.player.y-46*k,28*k,46*k);
    for(const acorn of this.growers){
      if(!acorn.active||!Phaser.Geom.Intersects.RectangleToRectangle(reach,new Phaser.Geom.Rectangle(acorn.x-8,acorn.y-9,16,18)))continue;
      acorn.setActive(false).setVisible(false);
      if(this.big){this.impact(acorn.x,acorn.y,0xffc94a,'已經很大了！','#fff3b3',1);this.owner.tone('note');continue;}
      this.setBig(true);this.impact(acorn.x,acorn.y,0xffc94a,'變大了！','#ffe08a',3);this.banner('變大了！','#ffe08a');this.hitstop(120);this.punch(.07,.004);this.owner.tone('grow');
      this.owner.emit({type:'hint',message:'變大了！被碰到只會變回原樣，不會少一顆心。'});
    }
    for(const child of this.notes.getChildren()){
      const note=child as Phaser.Physics.Arcade.Image;
      if(!note.active)continue;
      if(!Phaser.Geom.Intersects.RectangleToRectangle(reach,new Phaser.Geom.Rectangle(note.x-8,note.y-10,16,20)))continue;
      note.disableBody(true,true);this.notesCollected++;this.burst(note.x,note.y,0xffdc7b,9);this.noteChain=this.simTime-this.lastNoteAt<2200?this.noteChain+1:1;this.lastNoteAt=this.simTime;
      const tier=this.noteChain>=5?3:this.noteChain>=3?2:this.noteChain>=2?1:0;
      this.impact(note.x,note.y,0xffdc7b,tier?`♪ ×${this.noteChain} 連續！`:`♪ ${this.notesCollected}/${notePositions.length}`,'#fff3b3',tier);
      if(this.notesCollected%5===0){this.banner(`♪ ${this.notesCollected} / ${notePositions.length}`,'#fff3b3');this.hitstop(90);this.punch(.06);if(!this.owner.reducedMotion)this.cameras.main.flash(120,255,240,190);}
      else{this.hitstop(35+tier*12);this.punch(.015+tier*.012);}this.owner.tone('note');this.sync();
    }
  }
  sync(){this.owner.emit({type:'tick',seconds:this.seconds,notes:this.notesCollected,total:notePositions.length});}
  /** Grow or shrink with a Mario-style stepped flicker; feet stay planted thanks to the bottom origin. */
  setBig(big:boolean,animate=true){
    this.big=big;this.sizeSteps?.remove();this.sizeSteps=undefined;
    const steps=big?[1.2,1,1.35,1.15,1.5]:[1.25,1.5,1.15,1.35,1];
    if(!animate||this.owner.reducedMotion){this.player.setScale(big?1.5:1);return;}
    let i=0;this.sizeSteps=this.time.addEvent({delay:70,repeat:steps.length-1,callback:()=>this.player.setScale(steps[i++])});
  }
  hurt(fell=false) {
    if(this.simTime<this.invulnerableUntil || !this.owner.running)return;
    if(this.big&&!fell){
      this.setBig(false);this.invulnerableUntil=this.simTime+1400;this.owner.tone('shrink');this.hitstop(90);
      if(!this.owner.reducedMotion)this.cameras.main.shake(100,.003);
      this.impact(this.player.x,this.player.y-30,0xf0ab85,'縮小了','#ffd2c4',1);return;
    }
    this.lives--;this.owner.emit({type:'health',lives:this.lives});this.owner.tone('hurt');
    if(!this.owner.reducedMotion){this.cameras.main.shake(100,.003);this.cameras.main.flash(160,240,120,100);}
    this.impact(this.player.x,this.player.y-20,0xf0ab85,'-1 ♥','#ffd2c4',1);this.hitstop(110);
    if(this.lives<=0){this.finish(false);return;}
    this.burst(this.player.x,this.player.y-20,0xf0ab85,12);this.respawn();this.invulnerableUntil=this.simTime+1400;
    this.owner.emit({type:'hint',message:this.checkpoint?'回到中途營地，再出發！':'沒關係！看準落腳處，再跳一次。'});
  }
  finish(won:boolean) {
    if(!this.owner.running)return;
    this.owner.running=false;this.owner.paused=false;this.player.setVelocity(0,0);this.player.setAlpha(1).setAngle(0);this.player.anims.stop();this.player.setTexture(this.frame('stand'));this.physics.pause();this.owner.releaseControls();this.sync();
    let best:Best|undefined;
    if(won){
      this.owl.setTexture(this.hostFrame(true));this.owner.tone('win');
      const current={notes:this.notesCollected,seconds:Math.round(this.seconds*10)/10};
      try{const value=JSON.parse(localStorage.getItem('echo-forest-best-v1')||'null') as Best|null;
        if(value && Number.isFinite(value.notes) && Number.isFinite(value.seconds) && value.notes>=0 && value.notes<=notePositions.length && value.seconds>=0)best=value;
        if(!best || current.notes>best.notes || (current.notes===best.notes && current.seconds<best.seconds))best=current;
        localStorage.setItem('echo-forest-best-v1',JSON.stringify(best));
      }catch{best=current;}
    }
    this.owner.emit({type:'end',won,notes:this.notesCollected,total:notePositions.length,seconds:this.seconds,best});
  }
  /** Touch feedback: expanding ring, star sparks and a floating label at the point of contact. */
  impact(x:number,y:number,color:number,label:string,labelColor='#fff3b3',tier=0){
    const text=this.add.text(x,y-14,label,{fontFamily:'sans-serif',fontSize:`${12+tier*2}px`,fontStyle:'bold',color:labelColor,stroke:'#1d3527',strokeThickness:3}).setOrigin(.5).setDepth(6).setResolution(2);
    this.tweens.add({targets:text,y:this.owner.reducedMotion?y-14:y-38-tier*6,alpha:0,duration:700+tier*100,ease:'Quad.easeOut',onComplete:()=>text.destroy()});
    if(this.owner.reducedMotion)return;
    this.rings.push({x,y,life:.4,color,size:1+tier*.35});
    if(tier>=2)this.rings.push({x,y,life:.55,color:0xffffff,size:1.6+tier*.3});
    const palette=[color,0xffffff,...(tier>=2?[0x9ff3ff]:[]),...(tier>=3?[0xffb3c7,0xc7a6ff]:[])];
    const count=10+tier*5;
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2+Math.random()*.3,v=60+tier*20+Math.random()*50;this.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-30,life:.55+tier*.08,color:palette[i%palette.length],size:i%2?2:3});}
  }
  /** Hitstop: freeze physics and the run clock for a few frames so a touch lands with weight. */
  hitstop(ms:number){if(!this.owner.running)return;this.hitstopUntil=Math.max(this.hitstopUntil,this.time.now+ms);this.physics.pause();}
  /** Camera punch: a quick zoom in and back; shake is added for heavier touches. */
  punch(amount:number,shake=0){
    if(this.owner.reducedMotion)return;
    const cam=this.cameras.main,base=this.owner.compact?4/3:1;
    this.zoomTween?.stop();cam.setZoom(base);
    this.zoomTween=this.tweens.add({targets:cam,zoom:base*(1+amount),duration:70,yoyo:true,ease:'Quad.easeOut',onComplete:()=>cam.setZoom(base)});
    if(shake)cam.shake(120,shake);
  }
  /** Big centred banner for milestones, fixed to the screen. */
  banner(text:string,color:string){
    const cam=this.cameras.main;
    const node=this.add.text(cam.width/2,cam.height*.32,text,{fontFamily:'sans-serif',fontSize:'30px',fontStyle:'900',color,stroke:'#1d3527',strokeThickness:6}).setOrigin(.5).setDepth(10).setScrollFactor(0).setResolution(2).setScale(this.owner.reducedMotion?1:.3);
    if(!this.owner.reducedMotion)this.tweens.add({targets:node,scale:1,duration:220,ease:'Back.easeOut'});
    this.tweens.add({targets:node,alpha:0,delay:650,duration:350,onComplete:()=>node.destroy()});
  }
  burst(x:number,y:number,color:number,count:number){if(this.owner.reducedMotion)return;for(let i=0;i<count;i++)this.particles.push({x,y,vx:Math.cos(i/count*Math.PI*2)*45,vy:Math.sin(i/count*Math.PI*2)*45-20,life:.5,color});}
  snapshot(){const b=this.player.body as Phaser.Physics.Arcade.Body;return {ready:this.ready,running:this.owner.running,paused:this.owner.paused,x:this.player.x,y:this.player.y,vx:b.velocity.x,vy:b.velocity.y,grounded:b.blocked.down||b.touching.down,seconds:this.seconds,notes:this.notesCollected,lives:this.lives,big:this.big,scale:this.player.scaleY,checkpoint:this.checkpoint,thornSpans,groundSpans,notePositions,enemies:this.enemyRanges.map(e=>({x:e.obj.x,active:e.obj.active})),movingX:this.moving.x};}
  update(_time:number,delta:number) {
    if(!this.ready)return;
    const dt=Math.min(delta,40)/1000;
    if(!this.owner.paused && !this.owner.reducedMotion){const hd=this.owner.look==='hd2d';this.motes.clear();for(let i=0;i<(hd?42:20);i++){const x=(i*83+_time*.005)%640;const y=60+(i*37)%240+Math.sin(_time*.0006+i)*8;if(hd){this.motes.fillStyle(0xffe6a0,.12);this.motes.fillCircle(x,y,i%3===0?4:3);}this.motes.fillStyle(0xffe6a0,.2+(i%3)*.15);this.motes.fillRect(Math.round(x),Math.round(y),i%3===0?2:1,2);}}
    if(!this.owner.running || this.owner.paused)return;
    if(_time<this.hitstopUntil){if(!this.physics.world.isPaused)this.physics.pause();return;}
    if(this.hitstopUntil){this.hitstopUntil=0;this.physics.resume();}
    this.simTime+=dt*1000;this.seconds+=dt;
    const body=this.player.body as Phaser.Physics.Arcade.Body;
    const grounded=body.blocked.down||body.touching.down;
    if(grounded)this.groundedAt=this.simTime;
    const left=this.cursor.left.isDown||this.cursor.a.isDown||this.owner.controls.left;
    const right=this.cursor.right.isDown||this.cursor.d.isDown||this.owner.controls.right;
    const jump=this.cursor.space.isDown||this.cursor.up.isDown||this.cursor.w.isDown||this.owner.controls.jump;
    if(jump&&!this.prevJump)this.jumpQueuedAt=this.simTime;
    if(!jump&&this.prevJump&&body.velocity.y < -165)body.setVelocityY(-165);
    if(this.simTime-this.jumpQueuedAt<130 && this.simTime-this.groundedAt<105){
      body.setVelocityY(-380);this.jumpQueuedAt=-1000;this.groundedAt=-1000;this.owner.tone('jump');this.burst(this.player.x,this.player.y,0xbacc86,5);
    }
    this.prevJump=jump;
    const axis=Number(right)-Number(left);
    body.setVelocityX(Phaser.Math.Linear(body.velocity.x,axis*180,Math.min(1,dt*(axis?14:20))));
    if(Math.abs(body.velocity.x)<2 && !axis)body.setVelocityX(0);
    if(axis)this.player.setFlipX(axis<0);
    if(!grounded){this.player.anims.stop();this.player.setTexture(this.frame('run_b'));this.player.setAngle(body.velocity.y<0?(this.player.flipX?8:-8):0);}
    else if(Math.abs(body.velocity.x)>10){this.player.setAngle(0);this.player.play(`${this.owner.character}_run`,true);}
    else{this.player.setAngle(0);this.player.anims.stop();this.player.setTexture(this.frame('stand'));}
    this.player.setAlpha(this.simTime<this.invulnerableUntil?(Math.floor(this.simTime/100)%2?.4:1):1);
    this.collectNotes();
    if(this.player.x<14){this.player.x=14;body.setVelocityX(0);}
    if(this.player.y>396){this.invulnerableUntil=0;this.hurt(true);}
    if(body.bottom>FLOOR-14&&thornSpans.some(([a,b])=>body.right>a+3&&body.left<b-3))this.hurt();
    this.growers.forEach((a,i)=>{if(a.active)a.y=a.getData('baseY')+Math.round(Math.sin(this.simTime*.005+i)*2);});
    if(this.player.x>1715 && !this.checkpoint){this.checkpoint=true;this.drawFlags();this.owner.emit({type:'checkpoint'});this.owner.tone('checkpoint');this.burst(1720,266,0xffda70,16);}
    if(this.player.x>3105 && this.player.y>246){this.finish(true);return;}
    this.enemyRanges.forEach(e=>{if(!e.obj.active)return;if(e.obj.x>e.end)e.direction=-1;if(e.obj.x<e.start)e.direction=1;e.obj.setVelocityX(e.direction*(e.start > 1700 ? 58 : 44));e.obj.setFlipX(e.direction<0);});
    if(this.moving.x>2240)this.moving.setVelocityX(-46);if(this.moving.x<2120)this.moving.setVelocityX(46);
    this.owl.setTexture(this.hostFrame(Math.floor(this.simTime/650)%2===1));
    this.effects.clear();this.particles=this.particles.filter(p=>p.life>0);for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=70*dt;this.effects.fillStyle(p.color,Math.min(1,p.life*3));const z=p.size??2;if(z>2){this.effects.fillRect(Math.round(p.x)-1,Math.round(p.y)-z+1,2,z*2-2);this.effects.fillRect(Math.round(p.x)-z+1,Math.round(p.y)-1,z*2-2,2);}else this.effects.fillRect(Math.round(p.x),Math.round(p.y),z,z);}
    this.rings=this.rings.filter(r=>r.life>0);for(const r of this.rings){r.life-=dt;const k=1-r.life/.4;this.effects.lineStyle(2,r.color,Math.max(0,1-k));this.effects.strokeCircle(r.x,r.y,(4+k*20)*(r.size??1));}
    if(this.simTime-this.tickAt>100){this.tickAt=this.simTime;this.sync();}
  }
}
export class ForestGame {
  controls:Controls={left:false,right:false,jump:false};running=false;paused=false;
  look:Look='standard';character='anbo';
  readonly compact=window.matchMedia('(max-width: 750px) and (orientation: portrait)').matches;
  readonly reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene:ForestScene; game:Phaser.Game; private sound=false;private audio?:AudioContext;
  constructor(parent:HTMLElement,public emit:(event:GameEvent)=>void) {
    this.scene=new ForestScene(this);
    this.game=new Phaser.Game({type:Phaser.AUTO,parent,width:640,height:this.compact?480:360,pixelArt:true,roundPixels:true,backgroundColor:'#173c36',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:'arcade',arcade:{gravity:{x:0,y:820},debug:false}},render:{antialias:false},audio:{noAudio:true},scene:[this.scene]});
  }
  start(){this.ensureAudio();this.scene.start();}
  setCharacter(id:string){if(!playableIds.includes(id)||this.running)return;this.character=id;if(this.scene.ready)this.scene.applyCharacter();}
  setLook(look:Look){this.look=look;if(this.scene.ready)this.scene.applyLook();}
  setPaused(paused:boolean){if(!this.running || this.paused===paused)return;this.paused=paused;this.releaseControls();if(paused)this.scene.physics.pause();else this.scene.physics.resume();this.emit({type:'pause',paused});}
  releaseControls(){this.controls={left:false,right:false,jump:false};if(this.scene.cursor)Object.values(this.scene.cursor).forEach(k=>k.reset());document.querySelectorAll('.held').forEach(e=>e.classList.remove('held'));}
  setControl(key:keyof Controls,down:boolean){this.controls[key]=down;}
  toggleSound(){this.sound=!this.sound;if(this.sound){this.ensureAudio();this.tone('note');}return this.sound;}
  ensureAudio(){if(!this.sound)return;try{this.audio??=new AudioContext();if(this.audio.state==='suspended')void this.audio.resume().catch(()=>{});}catch{this.sound=false;}}
  tone(kind:string){if(!this.sound)return;this.ensureAudio();if(!this.audio)return;const a=this.audio;const notes:Record<string,number[]>={note:[660,880],jump:[260,400],bounce:[320,640],hurt:[180,110],checkpoint:[523,659,784],grow:[392,523,659,784,1047],shrink:[523,392,262],win:[523,659,784,1047]};(notes[kind]||[440]).forEach((freq,i)=>{const o=a.createOscillator(),g=a.createGain(),t=a.currentTime+i*.085;o.type='triangle';o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.06,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+.13);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+.15);});}
}
