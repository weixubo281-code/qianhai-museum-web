import bpy, math, random, os, json
from mathutils import Vector
from math import sin, cos, pi

ROOT = os.path.dirname(os.path.abspath(__file__))
random.seed(37)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
base = bpy.data.collections.get('Collection'); base.name = '00_Scene'
def collection(name):
    c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
arch=collection('01_Architecture'); glazing=collection('02_Glazing_and_Mullions')
site=collection('03_Landscape'); trees=collection('04_Trees'); cams=collection('05_Cameras_Lighting')
def move(obj,col):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    col.objects.link(obj); return obj
def mat(name,color,rough=.5,metal=0,trans=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    p.inputs['Transmission Weight'].default_value=trans; p.inputs['IOR'].default_value=1.46
    return m
white=mat('Shell | warm satin white',(.86,.88,.86),.28,.12)
glass=mat('Glass | blue grey architectural',(.30,.48,.53),.12,.08,.82)
frame=mat('Mullions | charcoal aluminium',(.075,.105,.11),.28,.7)
stone=mat('Promenade | pale stone',(.52,.54,.50),.78)
darkstone=mat('Paving joints',(.30,.33,.31),.9)
grass=mat('Planting beds | meadow',(.16,.23,.065),.95)
wood=mat('Tree bark',(.13,.08,.038),.9)
leaves=[mat('Foliage %02d'%i,col,.9) for i,col in enumerate([(.095,.17,.045),(.18,.27,.075),(.25,.32,.09),(.07,.14,.06)])]
water=mat('Bay | gently rippled water',(.045,.19,.235),.19,.28,.2)
p=water.node_tree.nodes.get('Principled BSDF'); ns=water.node_tree.nodes
n=ns.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=1.8; n.inputs['Detail'].default_value=3
b=ns.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.23; b.inputs['Distance'].default_value=.22
water.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']); water.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
def mesh(name,v,f,m,col=arch,smooth=False):
    me=bpy.data.meshes.new(name); me.from_pydata(v,[],f); me.update()
    o=bpy.data.objects.new(name,me); col.objects.link(o); o.data.materials.append(m)
    if smooth:
        for p in me.polygons:p.use_smooth=True
    return o
def cube(name,loc,scale,m,col=arch,bev=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m);move(o,col)
    if bev: mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bev;mod.segments=3
    return o
def line(name,points,r,m,col=arch,cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=r;cu.bevel_resolution=2
    s=cu.splines.new('POLY');s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    s.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,cu);col.objects.link(o);cu.materials.append(m);return o
def radial(t):return cos(3*(t-pi/2))
def outer(t):return 46+13*radial(t)
def inner(t):return 12.4+1.25*radial(t)
def roof(t,u):
    r=inner(t)+(outer(t)-inner(t))*u
    edge=max(1.5,15.8-6.3*radial(t)-12.6*math.exp(-((radial(t)-.3)/.29)**2))
    z=(1-u)*23.2+u*edge+3.0*sin(pi*u)
    return (r*cos(t),r*sin(t),z)
N=384;R=64
v=[roof(2*pi*j/N,i/R) for i in range(R+1) for j in range(N)]
f=[]
for i in range(R):
    for j in range(N):a=i*N+j;b=i*N+(j+1)%N;f.append((a,b,b+N,a+N))
shell=mesh('ROOF | continuous three-wing shell',v,[tuple(reversed(face)) for face in f],white,smooth=True)
solid=shell.modifiers.new('Editable shell thickness 0.45m','SOLIDIFY');solid.thickness=.45
bpy.context.view_layer.objects.active=shell;bpy.ops.object.modifier_apply(modifier=solid.name)
# Three real apertures cut through the shell near each rounded wing tip.
for k in range(3):
    t=pi/2+k*2*pi/3;u=.79;pos=roof(t,u)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=pos)
    cutter=bpy.context.object;cutter.name='Temporary aperture cutter';cutter.scale=(7.7,2.65,5.5);cutter.rotation_euler[2]=t
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.context.view_layer.objects.active=shell
    mod=shell.modifiers.new('Wing aperture %d'%(k+1),'BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    # Recessed glass closes the exterior aperture, with editable perimeter frame.
    pts=[]
    for j in range(97):
        a=2*pi*j/96;dr=7.35*cos(a);dt=2.5*sin(a)
        x=pos[0]+dr*cos(t)-dt*sin(t);y=pos[1]+dr*sin(t)+dt*cos(t)
        tt=math.atan2(y,x);rr=math.hypot(x,y);uu=(rr-inner(tt))/(outer(tt)-inner(tt))
        pts.append((x,y,roof(tt,uu)[2]-.7))
    mesh('Wing %d | recessed eye glass'%(k+1),[pos[:2]+(pos[2]-.9,)]+pts,[(0,j+1,j+2) for j in range(96)],glass,glazing,True)
    line('Wing %d | aperture edge'%(k+1),pts,.07,frame,glazing,True)
# Fine radial panel joints across the white roof.
for j in range(96):
    t=2*pi*j/96
    # Avoid running joints over the wing apertures.
    d=min(abs((t-(pi/2+k*2*pi/3)+pi)%(2*pi)-pi) for k in range(3))
    intervals=[(0,.58),(.97,1)] if d<.075 else [(0,1)]
    for a,b in intervals:
        line('Roof seam %03d'%j,[(x,y,z+.012) for x,y,z in [roof(t,a+(b-a)*i/36) for i in range(37)]],.013,darkstone)
line('Roof | perimeter fascia',[roof(2*pi*j/N,1) for j in range(N)],.17,white,arch,True)
# Curtain wall panels and a consistent external frame grid.
M=240
for j in range(M):
    t1=2*pi*j/M;t2=2*pi*(j+1)/M
    a=roof(t1,1);b=roof(t2,1)
    a=(a[0]*.987,a[1]*.987,a[2]-.35);b=(b[0]*.987,b[1]*.987,b[2]-.35)
    mesh('Facade | glass %03d'%j,[(a[0],a[1],.65),(b[0],b[1],.65),b,a],[(0,1,2,3)],glass,glazing)
    line('Facade | upright %03d'%j,[(a[0],a[1],.5),a],.065,frame,glazing)
for z in [4.1,7.7,11.3,14.9,18.5]:
    for j in range(M):
        a=roof(2*pi*j/M,1);b=roof(2*pi*(j+1)/M,1)
        if min(a[2],b[2])>z+.4:line('Facade | horizontal %.1f'%z,[(a[0]*.987,a[1]*.987,z),(b[0]*.987,b[1]*.987,z)],.055,frame,glazing)
# Central triangular skylight, convex glass and radial/ring structural grid.
def sky(t,u):
    r=inner(t)*u;return(r*cos(t),r*sin(t),23.05+1.9*(1-u*u))
S=120;K=16
sv=[sky(2*pi*j/S,i/K) for i in range(K+1) for j in range(S)]
sf=[(i*S+j,i*S+(j+1)%S,(i+1)*S+(j+1)%S,(i+1)*S+j) for i in range(K) for j in range(S)]
mesh('SKYLIGHT | rounded triangular glass',sv,[tuple(reversed(face)) for face in sf],glass,glazing,True)
for j in range(30):line('Skylight | radial frame %02d'%j,[sky(2*pi*j/30,i/30) for i in range(31)],.045,frame,glazing)
for i in range(1,10):line('Skylight | ring %02d'%i,[sky(2*pi*j/120,i/9) for j in range(120)],.045,frame,glazing,True)
# Only neutral ground floor: internal layout is intentionally not reconstructed.
floorpts=[(outer(2*pi*j/N)*cos(2*pi*j/N),outer(2*pi*j/N)*sin(2*pi*j/N),.42) for j in range(N)]
mesh('Building | neutral ground slab',[(0,0,.42)]+floorpts,[(0,j+1,(j+1)%N+1) for j in range(N)],stone)
cube('Entry | central door canopy',(0,-34,4.0),(10,4,.35),white,bev=.12)
for x in [-4,-2,0,2,4]:cube('Entry | door frame',(x,-36,2.0),(.08,.12,3.4),frame)
cube('Entry | threshold',(0,-37,.4),(13,6,.5),stone,bev=.2)
# Coastal site: promenade, planting islands, waterfront and distant water.
cube('Site | raised waterfront plinth',(0,0,-.65),(164,161,1.8),stone,site,1)
cube('Site | coastal retaining edge',(83,0,-.1),(2.2,164,2),darkstone,site,.2)
cube('Bay | water',(0,0,-1.05),(4000,4000,.2),water,site)
cube('Landscape | surrounding ground',(-500,-400,-1.0),(1160,960,.3),grass,site)
# Low distant coastal hills, scenic context rather than a surveyed city replica.
hillmat=mat('Distant coast | atmospheric sage',(.22,.31,.29),1)
for k in range(9):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=(-500+k*145,530+random.uniform(-40,40),-18))
    ob=bpy.context.object;ob.name='Context | distant coastal hill';ob.scale=(130,75,random.uniform(35,66));ob.data.materials.append(hillmat);move(ob,site)
    for p in ob.data.polygons:p.use_smooth=True
for x in range(-78,81,8):line('Promenade | joint',[(x,-79,.27),(x,79,.27)],.022,darkstone,site)
for y in range(-76,80,8):line('Promenade | joint',[(-80,y,.27),(80,y,.27)],.022,darkstone,site)
def ellipse(name,x,y,rx,ry,z,m):
    vs=[(x,y,z)]+[(x+rx*cos(2*pi*j/64),y+ry*sin(2*pi*j/64),z) for j in range(64)]
    return mesh(name,vs,[(0,j+1,(j+1)%64+1) for j in range(64)],m,site)
# Linked canopy geometry keeps vegetation editable and memory-efficient.
protos=[]
for i in range(4):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(0,0,-100))
    o=bpy.context.object;o.name='Canopy prototype %d'%i;o.data.materials.append(leaves[i]);move(o,trees)
    for vert in o.data.vertices:vert.co*=random.uniform(.82,1.2)
    for p in o.data.polygons:p.use_smooth=True
    o.hide_render=True;o.hide_viewport=True;protos.append(o)
def tree(x,y,size):
    line('Tree | trunk',[(x,y,.4),(x,y,size*.69)],.13*size/5,wood,trees)
    for k in range(28):
        a=k*2.4;rad=size*.22 if k else 0
        loc=(x+rad*cos(a),y+rad*sin(a),size*(.73+random.random()*.18))
        o=bpy.data.objects.new('Tree | linked foliage',random.choice(protos).data);trees.objects.link(o);o.location=loc
        s=.24 if k<6 else random.uniform(.095,.17)
        if k>=6:
            o.location.x+=random.uniform(-size*.2,size*.2);o.location.y+=random.uniform(-size*.2,size*.2);o.location.z+=random.uniform(-size*.18,size*.15)
        o.scale=(size*s,size*s*.92,size*s*.88);o.rotation_euler=(random.random(),random.random(),a)
        if k:line('Tree | branch',[(x,y,size*.5),loc],.065,wood,trees)
for j in range(22):
    t=2*pi*j/22;r=outer(t)+14+random.uniform(0,4);x=r*cos(t);y=r*sin(t)
    if y<-42 and abs(x)<16:continue
    ellipse('Landscape | planting island',x,y,random.uniform(5,8),random.uniform(3,5),.32,grass)
    for k in range(3):tree(x+random.uniform(-3,3),y+random.uniform(-2,2),random.uniform(4.2,6.6))
for y in range(-69,75,12):
    for x in [-73,73]:
        ellipse('Landscape | avenue bed',x,y,3,4,.33,grass);tree(x,y,random.uniform(4,5.7))
for y in [-60,-48]:
    for x in [-24,24]:cube('Landscape | bench',(x,y,.85),(4,1,.65),white,site,.12)
# Small neutral scale figures, no invented exhibits.
peoplemat=mat('Scale figures | neutral',(.22,.28,.28),.75)
for j in range(22):
    x=random.uniform(-25,25);y=random.uniform(-65,-39)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.19,location=(x,y,1.91));o=bpy.context.object;o.name='Scale figure | head';o.data.materials.append(peoplemat);move(o,site)
    line('Scale figure | body',[(x,y,.55),(x,y,1.65)],.22,peoplemat,site)
def camera(name,loc,target,lens=48):
    bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.name=name;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens;o.data.clip_end=3000;move(o,cams);return o
hero=camera('CAM_01 | three-quarter',(133,-177,83),(0,0,8),48)
front=camera('CAM_02 | front',(0,-195,39),(0,0,11),49)
top=camera('CAM_03 | roof aerial',(0,-.01,214),(0,0,0),50)
top.data.type='ORTHO';top.data.ortho_scale=224
detail=camera('CAM_04 | shell detail',(100,-90,40),(31,-20,12),58)
scene=bpy.context.scene;scene.camera=hero
bpy.ops.object.light_add(type='SUN',location=(-80,-100,150));sun=bpy.context.object;sun.name='Sun | upper-left daylight';sun.rotation_euler=(.42,-.5,-.45);sun.data.energy=2.5;sun.data.angle=.075;move(sun,cams)
world=bpy.data.worlds.new('Coastal daylight');world.use_nodes=True;scene.world=world
ns=world.node_tree.nodes;skytex=ns.new('ShaderNodeTexSky');skytex.sky_type='MULTIPLE_SCATTERING';skytex.sun_elevation=.55;skytex.sun_rotation=2.4;skytex.sun_disc=False
world.node_tree.links.new(skytex.outputs['Color'],ns.get('Background').inputs['Color']);ns.get('Background').inputs['Strength'].default_value=.32
scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True
try:
    pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
    for d in pref.devices:d.use=d.type!='CPU'
    if any(d.use for d in pref.devices):scene.cycles.device='GPU'
    print('CYCLES_DEVICES',[(d.name,d.use) for d in pref.devices],flush=True)
except Exception as e:print('GPU_SETUP',e,flush=True)
scene.render.resolution_x=2560;scene.render.resolution_y=1440;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.unit_settings.system='METRIC'
scene['Project']='Shenzhen Qianhai Natural Museum | reference-based exterior study'
scene['Accuracy']='Concept reconstruction from supplied images; dimensions approximate; not an engineering/as-built model. No internal exhibition layout inferred.'
scene['Editable']='Named shell mesh, independent glass panels, curve mullions, linked trees, four cameras; procedural rebuild script supplied.'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=170
bpy.ops.object.select_all(action='DESELECT');shell.select_set(True);bpy.context.view_layer.objects.active=shell
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'Qianhai_Nature_Museum.blend'))
print('PROJECT_SAVED',flush=True)
for name,cam in [('01_Architectural_Perspective',hero),('02_Front_Elevation',front),('03_Roof_Aerial',top),('04_Shell_Detail',detail)]:
    scene.camera=cam;scene.render.filepath=os.path.join(ROOT,'renders',name+'.png');bpy.ops.render.render(write_still=True);print('RENDER_DONE',name,flush=True)
scene.camera=hero;scene.render.filepath=os.path.join(ROOT,'renders','01_Architectural_Perspective.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'Qianhai_Nature_Museum.blend'))
report={'blender':bpy.app.version_string,'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'materials':len(bpy.data.materials),'cameras':[o.name for o in scene.objects if o.type=='CAMERA'],'renders':[f for f in os.listdir(os.path.join(ROOT,'renders')) if f.endswith('.png')]}
with open(os.path.join(ROOT,'validation.json'),'w',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print('ALL_DONE',report,flush=True)
