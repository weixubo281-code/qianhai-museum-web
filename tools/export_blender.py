import bpy, os, json
from collections import defaultdict
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE=os.path.join(ROOT,'source','blender','Qianhai_Nature_Museum.blend')
bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene
manifest={'source':SOURCE,'units':'meters','axis':'Z_UP to Y_UP','objects':[],'animations':[a.name for a in bpy.data.actions]}
groups={}
for name in ['Roof_Root','Skylight_Root','Facade_Root','Base_Root','Landscape_Root']:
    e=bpy.data.objects.new(name,None);scene.collection.objects.link(e);groups[name]=e
buckets=defaultdict(list)
deps=bpy.context.evaluated_depsgraph_get()
objects=list(scene.objects)
for o in objects:
    if o.type not in {'MESH','CURVE'} or o.hide_render:continue
    # Far background is rebuilt as real-time water and depth-fog; preserve source project.
    if o.name.startswith(('Bay |','Context |','Landscape | surrounding')):continue
    group='Landscape_Root'
    if o.name.startswith(('ROOF','Roof','Wing')):group='Roof_Root'
    elif o.name.startswith(('SKYLIGHT','Skylight')):group='Skylight_Root'
    elif o.name.startswith('Facade'):group='Facade_Root'
    elif o.name.startswith(('Building','Entry')):group='Base_Root'
    manifest['objects'].append({'name':o.name,'parent':o.parent.name if o.parent else None,'matrix':[list(row) for row in o.matrix_world],'webGroup':group,'type':o.type})
    if o.type=='CURVE':o.data.bevel_resolution=0;o.data.resolution_u=1
    ev=o.evaluated_get(deps)
    me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=deps)
    if not me.vertices:continue
    me.transform(o.matrix_world)
    uv=me.uv_layers.active or me.uv_layers.new(name='WebUV')
    if not o.type=='MESH' or not o.data.uv_layers:
        for p in me.polygons:
            axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
            for li in p.loop_indices:
                v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]*.15,v[axes[1]]*.15)
    n=bpy.data.objects.new('WEB_'+o.name,me);scene.collection.objects.link(n);n.parent=groups[group]
    n['sourceName']=o.name;n['sourceParent']=o.parent.name if o.parent else '';n['sourceTransform']=[x for row in o.matrix_world for x in row]
    material=me.materials[0].name if me.materials else 'none'
    buckets[(group,material)].append(n)
    o.hide_set(True)
print('CONVERTED',len(manifest['objects']),flush=True)
# Batch static siblings by material while retaining semantic, animatable roots.
for (group,material),items in buckets.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in items:o.select_set(True)
    bpy.context.view_layer.objects.active=items[0]
    bpy.ops.object.join();o=bpy.context.object;o.name=group.replace('_Root','')+'__'+material
    o['sourceObjects']=json.dumps([x['name'] for x in manifest['objects'] if x['webGroup']==group])
    o.data.update()
    print('BATCH',o.name,len(o.data.polygons),flush=True)
bpy.ops.object.select_all(action='DESELECT')
for root in groups.values():
    root.select_set(True)
    for o in root.children:o.select_set(True)
os.makedirs(os.path.join(ROOT,'work'),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'work','museum-raw.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_extras=True,export_materials='EXPORT')
manifest['webRoots']=list(groups);manifest['originalParentCount']=sum(x['parent'] is not None for x in manifest['objects'])
manifest['note']='Original has no object parenting or animation. Static siblings batched by semantic layer and material; original editable blend remains intact. No original external textures; procedural water recreated in shader.'
with open(os.path.join(ROOT,'work','source-objects.json'),'w',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False)
print('EXPORT_DONE',flush=True)
