//
// wShade.js 

//main namespace
(function(global){

    /**
     * Main namespace
     * @namespace WS
     */
    
    /**
     * the global namespace, access it using WS.
     * @class .
     */
    
    var WS = global.WS = {
        version: 1.0
    };
    
    WS.setup = function(o)
    {
        o = o || {};
        if(WS.configuration)
            throw("setup already called");
        WS.configuration = o;
    }

    WS.getSelected = function()
    {
        return WS.Components.PICK.selected;
    }

    // Add properties to Rendeer

    Object.defineProperty(RD.SceneNode.prototype, 'isEmissive', {
        get: function() { return this._isEmissive; },
        set: function(v) { this._isEmissive = v; this._uniforms["u_isEmissive"] = v; },
        enumerable: true //avoid problems
    });

    Object.defineProperty(RD.SceneNode.prototype, 'hasAlpha', {
        get: function() { return this._hasAlpha; },
        set: function(v) { this._hasAlpha = v; this._uniforms["u_hasAlpha"] = v; },
        enumerable: true //avoid problems
    });

    Object.defineProperty(RD.SceneNode.prototype, 'hasAO', {
        get: function() { return this._hasAO; },
        set: function(v) { this._hasAO = v; this._uniforms["u_hasAO"] = v; },
        enumerable: true //avoid problems
    });

    Object.defineProperty(RD.SceneNode.prototype, 'hasBump', {
        get: function() { return this._hasBump; },
        set: function(v) { this._hasBump = v; this._uniforms["u_hasBump"] = v; },
        enumerable: true //avoid problems
    });

    Object.defineProperty(RD.SceneNode.prototype, 'hasNormal', {
        get: function() { return this._hasNormal; },
        set: function(v) { this._hasNormal = v; this._uniforms["u_hasNormal"] = v; },
        enumerable: true //avoid problems
    });

    RD.SceneNode.prototype.setTextureProperties = function()
    {
        let values = ['albedo', 'roughness', 'metalness', 'normal'];

        for( v in values )
        {
            let value = values[v];
            let macro = `HAS_${value.toUpperCase()}_MAP`;
            if(this.textures[ value ]) default_shader_macros[ macro ] = true;
            else delete default_shader_macros[ macro ];
        }

        // Uncommon properties

        this.isEmissive = this.textures['emissive'] ? true : false; 
        this.hasAlpha = this.textures['opacity'] ? true : false;
        this.hasAO = this.textures['ao'] ? true : false; 
        this.hasBump = this.textures['height'] ? true : false; 
        // this.hasNormal = this.textures['normal'] ? true : false; 

        if(CORE)
        CORE.reloadShaders();
    }

    /**
    * Responsible of configuring scene, 3d nodes and its properties  
    * @class Core
    * @constructor
    */
    function Core( o )
    {
        if(this.constructor !== WS.Core)
            throw("Use new to create WS.Core");

        this._ctor();
        if(o)
            this.configure( o );
    }
    
    WS.Core = Core;
    
    Core.prototype._ctor = function()
    {
        this._uid = guidGenerator();
        this._descriptor = "";
        
        this._uniforms = {};
        this._environment = "no current";
        this._last_environment = "no last";
        this._blur_samples = default_shader_macros['N_SAMPLES'];
        this._no_repeat = false;
        this.selected_radius = 1; // for wheel speed
        
        this._scene = new RD.Scene();
        this._root = this._scene.root;

        light = null;

        // important nodes
        let cubemap = new RD.SceneNode();
        cubemap.name = "cubemap";
        cubemap.mesh = "cube";
        cubemap.shader = "skybox";
        cubemap.flags.depth_test = false;
        cubemap.flags.flip_normals = true;
        cubemap.render_priority = RD.PRIORITY_BACKGROUND;
        
        cubemap.ready = function() { 
            let ready = (this.textures['env'] && this.textures['env_1']
            && this.textures['env_2'] && this.textures['env_3']
            && this.textures['env_4'] && this.textures['env_5'] ) ? true : false;

            return ready;
        };

        this._cubemap = cubemap;
        
        this._root.addChild(cubemap);

        this._context = GL.create({width: window.innerWidth, height: window.innerHeight, 
            // alpha: true, premultipliedAlpha: false
        });

        this._renderer = new RD.Renderer( this._context, {
            autoload_assets: true
        });

        var w = (gl.canvas.width)|0;
        var h = (gl.canvas.height)|0;
        var type = gl.FLOAT;
        
        this._viewport_tex = new GL.Texture(w,h, { texture_type: GL.TEXTURE_2D, type: type, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
		this._fx_tex = new GL.Texture(w,h, { texture_type: GL.TEXTURE_2D, type: type, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
        this._background_color = vec4.fromValues(0.2, 0.2, 0.2,1);

        this._controller = new WS.Controller( this._context );
        this._gui = new WS.GUI();

        // list of objects (uniforms and all that the tonemapper needs)
        this._tonemappers = {};
    }

    Core.prototype.getCanvas = function ()
    {
        return this._renderer.canvas;
    }

    Core.prototype.registerTonemapper = function( base_class )
    {
        // Control that param has necessary items
        if(!base_class || !base_class.constructor)
        throw('tonemapper class needed');

        //extend class
		if(base_class.prototype) //is a class
            for(var i in Tonemapper.prototype)
                if(!base_class.prototype[i])
                    base_class.prototype[i] = Tonemapper.prototype[i];

        var instance = new base_class();
        var fs_code = instance.injectCode( base_class );
		var name = base_class.Name;

		instance.shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, fs_code );
        //gl.shaders[name] = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, fs_code );
        
        this._tonemappers[name] = instance;
    } 
    
    /**
    * Configure this Core to a state from an object (used with serialize)
    * @method configure
    * @param {Object} o object with the state of a Core
    */
    Core.prototype.configure = function(o)
    {
        //copy to attributes
        for(var i in o)
        {
            switch( i )
            {
                case "somecase": //special case
                    continue;
            };

            //default
            var v = this[i];
            if(v === undefined)
                continue;

            if( v && v.constructor === Float32Array )
                v.set( o[i] );
            else 
                this[i] = o[i];
        }
    }
    
    Object.defineProperty(Core.prototype, 'cubemap', {
        get: function() { return this._cubemap; },
        set: function(v) { this._cubemap = v; this._root.addChild(v); },
        enumerable: true
    });

    Object.defineProperty(Core.prototype, 'scene', {
        get: function() { return this._scene; },
        set: function(v) { this._scene = v; },
        enumerable: true
    });

    Object.defineProperty(Core.prototype, 'controller', {
        get: function() { return this._controller; },
        set: function(v) { this._controller = v; },
        enumerable: true
    });
    
    Object.defineProperty(Core.prototype, 'blur_samples', {
        get: function() { return this._blur_samples; },
        set: function(v) { this._blur_samples = v; default_shader_macros['N_SAMPLES'] = v; },
        enumerable: true
    });

    /**
    * Render all the scene
    * @method render
    */
    Core.prototype.render = function()
    {
        var renderer = this._renderer;

        if(!this.cubemap.ready())
        return;

		// Update cubemap position
        this.cubemap.position = this.controller.getCameraPosition();

        // Render scene to texture
        this._viewport_tex.drawTo( () => {
            renderer.clear( this._background_color );
            renderer.render( this.scene, this.controller._camera );
        });
        
        gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

		// Fill renderer uniforms with average, max lum, etc.
        getFrameInfo( this._viewport_tex );

        // Apply (or not) bloom effect
        var render_texture = this._viewport_tex; 
		if( WS.Components.FX._glow_enable )
			render_texture = createGlow( this._viewport_tex );

		// Get tonemapper and apply ********************
		// (exposure, offset, tonemapping, degamma)
		var name = WS.Components.FX.tonemapping;
		var myToneMapper = this._tonemappers[ name ];
		myToneMapper.apply( render_texture, this._fx_tex ); 

		// Apply antialiasing (FXAA)
		if( WS.Components.FX._fxaa ) {
			var fxaa_shader = Shader.getFXAAShader();
			fxaa_shader.setup();
			this._fx_tex.toViewport( fxaa_shader );
		}
		else
			this._fx_tex.toViewport();

        // Render GUI
        this._gui.render();
        
        // Render node selected
        WS.Components.PICK.render();
    }

    /**
    * Render all the scene
    * @method render
    * @param {number} dt
    */
    Core.prototype.update = function(dt)
    {
        _dt = dt;

        // Update all nodes in the scene
        this.scene.update(dt);

        // Update controller bindings
        this.controller.update(dt, this._renderer.context);
    }

    /**
    * Set and configure scene 
    * @method set
    * @param {string} env_path
    * @param {Object} options
    */
    Core.prototype.set = function(env_path, options)
    {
        console.warn("Setting environment...");

        if(!this._cubemap)
            throw("Create first a cubemap node");

        var tex_name = HDRTool.getName( env_path );
        var options = options || {};

        if(this._environment == tex_name && tex_name != ":atmos") {
            this._gui.loading(0);
            return;
        }

        this._last_environment = this._environment;
        this._environment = tex_name;
                
        var that = this;
        var oncomplete = () => { that.display( options.no_free_memory ); if(options.onImport) options.onImport(); };
        var params = {oncomplete: oncomplete};

        if(tex_name != ":atmos")
            this.cubemap.shader = "skybox";

        if(gl.textures[ "_prem_0_" + this._environment ] && tex_name != ":atmos")
            this.display();
        else
        {
            // Load hdre pre-processed files
            if( env_path.includes(".hdre") )
                HDRTool.load( env_path, params);
            else // Load and prefilter exr files
                HDRTool.prefilter( env_path, params );
        }

		// set this to allow perform another prefilter 
        HDRTool.FIRST_PASS = true; 
    }
 
    /**
    * Display configured scene
    * @method display
    * @param {Boolean} no_free_memory
    */
    Core.prototype.display = function( no_free_memory )
    {
        // delete previous em (free memory)
        if( !no_free_memory )
            for(var t in gl.textures)
                if(t.includes( this._last_environment ))
                    delete gl.textures[t];

        // update environment in all necessary nodes
        if(gl.textures[this._environment])
            this.updateNodes();
        
        // config scene
        this._cubemap.texture = this._environment;
        
		// gui
        this._gui.loading(false, () => $(".pbar").css("width", "0%"));
        console.log("%c" + this._environment, 'font-weight: bold;');
    }
    
    /**
    * Parse scenes data (or JSON)
    * @method parse
    * @param {string} name
    */
    Core.prototype.parse = function(name)
    {
        var toParse = scenes[name];

        // clean scene
        this.destroyByName('node');

        if(toParse.camera)
        {
            let eye = toParse.camera['eye'] || [0, 0, 5];
            let target = toParse.camera['target'] || [0, 0, 0];
            this.controller.lookAt(eye, target, RD.UP );
        }

        switch( name )
        {
            case "Matrix":
                this.renderMatrix( true ); break;
            case "Roughness scale":
                this.renderSphereScale( true, { property: 'roughness', aux_prop: 1.0 } ); break;
            case "Metalness scale":
                this.renderSphereScale( true, { property: 'metalness', aux_prop: 0.5 } ); break;
            default:
                this.loadResources( toParse, name ); break
        }
    }

    /**
    * Load mesh or meshes
    * @method loadResources
    * @param {Object} toParse
    */
    Core.prototype.loadResources = async function( toParse, name )
    {
        var that = this;

        // Load array of meshes
        var meshes = [].concat(toParse.mesh);

        for(var i = 0; i < meshes.length; i++)
        {
            let resource = meshes[i];

            var node = new RD.SceneNode();
            node.mesh = resource;
            node.shader = (this._environment == "no current") ? "phong" : toParse.shader;
            node.name = "node-" + simple_guidGenerator();
            node.render_priority = RD.PRIORITY_ALPHA;
            node.blend_mode = RD.BLEND_ALPHA;
            that._root.addChild( node );

            if( toParse.uniforms )
                node._uniforms = toParse.uniforms;
            
            if(toParse.shader != "pbr")
                continue;

            // for multimesh nodes
            toParse.textures = [].concat(toParse.textures);

            // load zero-metalness texture to avoid strange artifacts (can be sub later)
            node.textures["metalness"] = "data/zero-metal.png";
            
            // load textures
            for(var t in toParse.textures[i])
                node.textures[t] = toParse.textures[i][t];

            // is emissive? has AO? has Alpha?
            node.setTextureProperties();

            renderer.loadMesh(resource, function(res){

                if(!res) 
                throw( "No mesh loaded" );
    
                // update target from bb
                let bb = gl.meshes[resource].getBoundingBox();
                let center = BBox.getCenter(bb);
                that.selected_radius = BBox.getRadius(bb);

                let globalMat = node.getGlobalMatrix();
                let result = vec3.create();
                vec3.transformMat4( result, center, globalMat );

                if(toParse.camera && toParse.camera.target)
                    result = toParse.camera.target;
                
                let eye = [0, that.selected_radius * 0.5, that.selected_radius * 2.5];

                if(toParse.camera && toParse.camera.eye)
                    eye = toParse.camera.eye;

                camera.lookAt(eye, result, RD.UP);
                that._gui.updateSidePanel(null, node.name);
            });
        }

        // update node textures from the current environment
        this.updateNodes();
    }
    
    /**
    * Update nodes with Core configuration
    * @method update
    */
    Core.prototype.updateNodes = function()
    {   
        // update environment map textures
        
        for (var i = 0; i < this._root.children.length; i++)
        {
            let node = this._root.children[i];

            if(!node) continue;

            node.textures['brdf'] = "_brdf_integrator";
            node.textures['env'] = this._environment;
            node.textures['env_1'] = "_prem_0_" + this._environment;
            node.textures['env_2'] = "_prem_1_" + this._environment;
            node.textures['env_3'] = "_prem_2_" + this._environment;
            node.textures['env_4'] = "_prem_3_" + this._environment;
            node.textures['env_5'] = "_prem_4_" + this._environment;

            if(!node.children.length)
                continue;

            for (var j = 0; j < node.children.length;  j++)
            {
                let child = node.children[j];

                child.textures['brdf'] = "_brdf_integrator";
                child.textures['env'] = this._environment;
                child.textures['env_1'] = "_prem_0_" + this._environment;
                child.textures['env_2'] = "_prem_1_" + this._environment;
                child.textures['env_3'] = "_prem_2_" + this._environment;
                child.textures['env_4'] = "_prem_3_" + this._environment;
                child.textures['env_5'] = "_prem_4_" + this._environment;
            }
        }
    }

    /**
    * Reset scene
    * @method reset
    */
    Core.prototype.reset = function()
    {
        this.destroyByName('node');
        this.controller.reset();
    }

    /**
    * Render current cubemap to texture
    * @method cubemapToTexture
    * @param {Type} oncomplete
    */
    Core.prototype.cubemapToTexture = function(oncomplete)
    {
        var that = this,
            d = this._renderer._camera.position;

        var tex = new GL.Texture(512,512,{
            texture_type: gl.TEXTURE_CUBE_MAP,
            filter: gl.LINEAR,
            format: gl.RGB
        });

        tex.drawTo(function(f, l) {
            var r = GL.Texture.cubemap_camera_parameters[l],
                r = new RD.Camera({
                position: d,
                target: [d[0] + r.dir[0], d[1] - r.dir[1], d[2] - r.dir[2]],
                up: r.up,
                fov: 90,
                aspect: 1,
                near: 0.1,
                far: 2E4
            });
            gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
            renderer.render(that.scene, r, [that.cubemap]);
        });

        gl.textures[":atmos"] = tex;

        if(oncomplete)
            oncomplete();
    }

    /**
    * reload scene shaders
    * @method reloadShaders
    */
    Core.prototype.reloadShaders = async function(macros, callback)
    {
        macros = macros || {};
        // assign default macros
        Object.assign(default_shader_macros, macros);
        
        return new Promise( resolve => {
            this._renderer.loadShaders("data/shaders.glsl", ()=>{
                
                console.log("Shaders reloaded!", default_shader_macros);
                if(callback)
                    callback();
                resolve();
            }, default_shader_macros);
        } );
    }
    
    /**
    * Set uniforms for scene or node
    * @method uniforms
    * @param {Type} uniforms
    * @param {Type} node
    */
    Core.prototype.uniforms = function(uniforms, node)
    {
        if(!node)
        {
            this._uniforms = uniforms;
            return;
        }
        
        // ...
    }
    
    /**
    * Returns nodes filtered by name
    * @method getByName
    * @param {string} name
    */
    Core.prototype.getByName = function(name)
    {
        for(var i = 0; i < this._root.children.length; i++)
            if(this._root.children[i].name == name)
                return this._root.children[i];
    }

    /**
    * Returns nodes filtered by property
    * @method getByProperty
    * @param {string} property
    */
    Core.prototype.getByProperty = function(property, value)
    {
        let r = [];
        for(var i = 0; i < this._root.children.length; i++)
            if(this._root.children[i][property] == value)
                r.push(this._root.children[i]);
        return r;
    }

    /**
    * Destroy nodes by name
    * @method destroyByName
    * @param {string} name
    */
    Core.prototype.destroyByName = function( o )
    {
        var l;
        if(name.constructor == Array)
        {
            l = [].concat(o);

            for(var i = 0; i < this._root.children.length; i++)
                if(l.indexOf( this._root.children[i].name) >= 0)
                    this._root.children[i].destroy(true);
        }
        // destroy all nodes which includes the argument as string
        else
        {
            for(var i = 0; i < this._root.children.length; i++)
                if(this._root.children[i].name.includes( o ))
                    this._root.children[i].destroy(true);
        }
    }

    /**
    * Render sphere matrix
    * @method renderMatrix
    * @param {bool} visible
    */
    Core.prototype.renderMatrix = function(visible)
    {
        var values = [0, 0.16666, 0.33333, 0.5, 0.66666, 0.83333, 1];
        // var values = [0, 0.11111, 0.22222, 0.33333, 0.44444, 0.55555,0.66666,0.7777,0.8888,0.999999];
        var em = this._environment;
        var node = new RD.SceneNode();
        node.name = "matrix_node";
        node.flags.visible = visible;
        this._root.addChild(node);

        for(var i = 0; i < values.length; i++)
        for(var j = 0; j < values.length; j++)
        {
            var mn = new RD.SceneNode();
            mn.mesh = "sphere";
            mn.shader = "pbr";
            mn.position = [j * 2.5, 0, i * 2.5];
            mn._uniforms["u_roughness"] = values[i];
            mn._uniforms["u_metalness"] = values[j];
            node.addChild(mn);
        }

        this.updateNodes();
        this.selected_radius = 1;

        if(this._gui._sidepanel)
            this._gui.updateSidePanel(null, name);
    }

    /**
    * Render sphere matrix
    * @method renderSphereScale
    * @param {bool} visible
    * @param {Object} options
    */
    Core.prototype.renderSphereScale = function(visible, options)
    {
        options = options || {};
        if(!options.property)
        throw( 'No property to make scale' );
        
        var prop = options.property;
        var name = (prop == 'roughness') ? 'roughness_scale_node' : 'metalness_scale_node';
        var aux_prop = options.aux_prop;
    
        var values = [1.0, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0.0];
        var em = this._environment;
        var node = new RD.SceneNode();
        node.name = name;
        node.flags.visible = visible;
        this._root.addChild(node);
    
        for(var i = 0; i < 9; i++)
        {
            var mn = new RD.SceneNode();
            mn.name = "child" + i;
            mn.mesh = "sphere";
            mn.shader = "pbr";
            mn.position = [0,0,i*2];
            node.addChild( mn );

            if(prop == 'roughness')
            {
                mn._uniforms["u_roughness"] = values[i];
                mn._uniforms["u_metalness"] = aux_prop != null ? aux_prop : 0.0;
            }
            else
            {
                mn._uniforms["u_roughness"] = aux_prop != null ? aux_prop : 1.0;
                mn._uniforms["u_metalness"] = values[i];
            }
        }

        this.updateNodes();
        this.selected_radius = 1;

        if(this._gui._sidepanel)
            this._gui.updateSidePanel(null, name);
    }

    /**
    * Add light to the scene
    * @method addLight
    */
    Core.prototype.addLight = function()
    {
        if(light) {
            LiteGUI.alert("Only one light supported");
            return;
        }

        light = new RD.SceneNode();
        light.mesh = "sphere";
        light.name = "light";
        light.position = WS.Components.LIGHT.position = [0, this._controller._camera.position[1]/2 + this.selected_radius, this.selected_radius ];
        light.visible = true;
        light.color = [1, 1, 1, 1];
        light.scaling = 0.05;
        this._root.addChild(light);
        this._light = light;

        this.updateNodes();

        if(this._gui._sidepanel)
            this._gui.updateSidePanel(null, "light");
    }

    /**
    * Add mesh to the scene
    * @method addMesh
    * @param {Mesh} mesh
    */
    Core.prototype.addMesh = function(mesh, resource)
    {
        var shader = (this._environment == "no current") ? "phong" : "pbr";
        var mesh_name = `${resource}-${simple_guidGenerator()}`;
        gl.meshes[mesh_name] = mesh;
        
        var d = this.controller._camera.target,
            node = new RD.SceneNode({
                mesh: mesh_name,
                shader: shader
            });

        node.name = "node-" + simple_guidGenerator();
        node._uniforms["u_roughness"] = 0.5;
        node._uniforms["u_metalness"] = 0.75;

        let bb = mesh.getBoundingBox();
        let center = BBox.getCenter(bb);
        this.selected_radius = radius = BBox.getRadius(bb);

        let globalMat = node.getGlobalMatrix();
        let result = vec3.create();
        vec3.transformMat4( result, center, globalMat );

        this.controller._camera.lookAt([ 0, radius * 0.5, radius * 3 ], result, RD.UP);
        this._root.addChild( node );
        this.updateNodes();

        if(this._gui._sidepanel)
            this._gui.updateSidePanel(null, node.name);
    }

    /**
    * Add primitive to the scene
    * @method addPrimitive
    * @param {String} mesh
    */
    Core.prototype.addPrimitive = function(mesh)
    {
        var shader = (this._environment == "no current") ? "phong" : "pbr";
        
        if(this._environment == 'no current')
            shader = "phong";
        
        let node = new RD.SceneNode({
                mesh: mesh,
                shader: shader
            });

        let bb = gl.meshes[node.mesh].getBoundingBox();
        let center = BBox.getCenter(bb);
        let radius = BBox.getRadius(bb);

        let globalMat = node.getGlobalMatrix();
        let result = vec3.create();
        vec3.transformMat4( result, center, globalMat );

        this.controller._camera.lookAt([ 0, radius * 0.5, radius * 2.5 ], result, RD.UP);

        node.name = "node-" + simple_guidGenerator();
        node._uniforms["u_roughness"] = 0.15;
        node._uniforms["u_metalness"] = 0.85;
        // node.flags.depth_test = false;
        
        if(mesh == "plane") 
            node.flags.two_sided = true;
        
        node.setTextureProperties();
        this._root.addChild( node );
        this.updateNodes();


        if(this._gui._sidepanel)
            this._gui.updateSidePanel(null, node.name);
    }

    /**
    * Get node properties needed when exporting
    * @method getProperties
    */
    Core.prototype.getProperties = function(node)
    {
        var properties = {
            name: node.name,
            position: node.position,
            mesh: node.mesh,
            shader: node.shader,

            color: node.color,
            textures: node.textures,
            scaling: node.scaling,
            rotation: node.rotation,

            uniforms: node._uniforms,
            flags: node.flags,
        }

        return properties;
    }

    /**
    * Creates an object of all the scene
    * @method toJSON
    */
    Core.prototype.toJSON = function()
    {
        let camera = this.controller._camera;

        var boo = {
            uid: this._uid,
            e: this._environment, 
            blur_samples: this._blur_samples,
            selected_radius: 1,
            background: this._background_color,
            controller: {
                eye: camera.position,
                target: camera.target,
                far: this.controller._far,
                near: this.controller._near,
                m_speed: this.controller._mouse_speed,
                w_speed: this.controller._wheel_speed,
            },
            descriptor: this._descriptor,
            uniforms: this._renderer._uniforms,
            components: {FX: WS.Components.FX, LIGHT: WS.Components.LIGHT},
            hasLight: (light) ? true : false,
            nodes: []
        }

        // export cubemap without textures
        let cubemap = this._root.children[0].clone();
        cubemap.textures = {};
        boo['nodes'].push( JSON.stringify(cubemap) );

        // skip cubemap
        for(var i = 1; i < this._root.children.length; i++) {
            // boo['nodes'].push( this.getProperties(this._root.children[i]) );
            let tmp = this._root.children[i].clone();
            boo['nodes'].push( JSON.stringify(tmp) );
        }

        return boo;
    }

    /**
    * Load scene from JSON
    * @method toJSON
    * @param {Object} o
    * @param {Boolean} only_settings
    */
    Core.prototype.fromJSON = function( o, only_settings )
    {
        var gui = this._gui;
        var o = o || {};

        gui.loading();
        
        this._uid = o.uid;
        this._background_color = o.background;
        this._blur_samples = o.blur_samples;
        this._descriptor = o.descriptor;
        this.selected_radius = o.selected_radius;
        this._renderer.setGlobalUniforms( o.uniforms );

        this.controller._mouse_speed = o.controller.m_speed;
        this.controller._wheel_speed = o.controller.w_speed;

        this.controller.configure({
            eye: o.controller.eye,
            target: o.controller.target,
            near: o.controller.near,
            far: o.controller.far,
            aspect: gl.canvas.width/gl.canvas.height
        });

        // // add scene nodes
        if(o.hasLight && !light)
            this.addLight();

        // configure settings
        for(var key in o.components)
        {
            var copy = o.components[key];
            //copy to attributes
            for(var i in copy)
            {
                var v = WS.Components[key][i];
                if(v === undefined)
                    continue;
    
                if( v && v.constructor === Float32Array )
                    v.set( copy[i] );
                else 
                    WS.Components[key][i] = copy[i];
            }
        }

        if(only_settings)
        {
            gui.updateSidePanel(null, 'root');
            return;
        }
        
            
        for(var i in o.nodes)    
        {
            var node_properties = JSON.parse(o.nodes[i]);
            
            switch(node_properties.name)
            {
                case 'lines':
                case 'light':
                    continue;
                case 'cubemap':
                    this.cubemap.flags = node_properties.flags;
                    break;
                case 'matrix_node':
                    this.renderMatrix( true );
                    break;
                default:
                    // create node and apply properties
                    let new_node = new RD.SceneNode();
                    new_node.name = "tmp";
                    new_node.configure(node_properties);
                    new_node.setTextureProperties();
                    this._root.addChild(new_node);
                    break;
            }
        }

        // set scene
        this.set( textures_folder + o.e );
        gui.updateSidePanel(null, 'root');
    }
    
    /**
    * Responsible of the GUI
    * @class GUI
    * @constructor
    */
    function GUI()
    {
        if(this.constructor !== WS.GUI)
            throw("Use new to create WS.GUI");
        
        this._ctor();
    }
    
    WS.GUI = GUI;
    
    GUI.prototype._ctor = function()
    {
        // FPS
        this._fps_enable = true;
        this._fps = 0;
        this._refresh_time = 250;
        this._last_fps = 0;
        this._last_time = 0;
        this._frames = 0;

        this._mainarea = null;

        // other properties
        this._allow_drop = true;
        this._enable_log = false;
    }
    
    /**
    * Initialize gui and split areas
    * @method init
    */
    GUI.prototype.init = function()
    {
        LiteGUI.init(); 

        var mainmenu = new LiteGUI.Menubar("mainmenubar");
        LiteGUI.add( mainmenu );

        this._mainarea = new LiteGUI.Area({id: "mainarea", content_id:"canvasarea", height: "calc( 100% - 35px )", main:true});
        LiteGUI.add( this._mainarea );

        var canvas = renderer.canvas;
        this._mainarea.onresize = function() {
            let w = this._mainarea.root.clientWidth - this._sidepanel.root.clientWidth - 4;
            let h = this._mainarea.root.clientHeight;
            resize(renderer, [w, h], camera);
        };
        this._mainarea.content.appendChild(canvas);
        
        let push = document.createElement('div');
        push.id = "push";
        push.style.position = "absolute";

        this._mainarea.content.appendChild(push);

        // create 2d canvas 

        var canvas = document.createElement("canvas");
        canvas.style.position = "relative";
        canvas.style.width = "60px";
        canvas.style.height = "30px";
        this._mainarea.content.appendChild(canvas);
        canvas.style.position = "absolute";
        canvas.style.bottom = "1px";
        canvas.style.borderBottom = "2px solid  rgb(30, 211, 111)";
        
        this._canvas2d = canvas;

        //split mainarea
        this.createSidePanel();

        var that = this;

        mainmenu.add("File/Save scene", { callback: () => this.onExport()});
        mainmenu.add("File/Load scene", { callback: () => this.onImport()});

        mainmenu.add("View/FPS counter", { type: "checkbox", instance: this, property: "_fps_enable", callback: () => { 
            if(!this._fps_enable) this.closeFPS();
            else this._canvas2d.style.display = "block";
        }});
        mainmenu.add("View/Log", { type: "checkbox", instance: this, property: "_enable_log", callback: function(){ 
            if(that._enable_log) $("#log").show();
            else $("#log").hide();
        }});
        mainmenu.add("View/Fullscreen", { callback: () => gl.fullscreen()});

        mainmenu.add("Actions/Reset all", { callback: () => { 
            CORE.reset();
            that.updateSidePanel(that._sidepanel, 'root');
        }});
        
        mainmenu.add("Actions/Allow drop", { type: "checkbox", instance: this, property: "_allow_drop"});
        mainmenu.add("Actions/Reload shaders", { callback: () => CORE.reloadShaders() });
        mainmenu.add("Actions/Get Environment (HDRE)", { callback: () => HDRTool.getSkybox( CORE._environment ) });
        mainmenu.add("Actions/Get Mesh (wBin)", { callback: () => {
            var node = WS.getSelected();

            if(!node)
            return;

            var mesh = gl.meshes[ node.mesh ];
            downloadBinary( mesh, "wbin" );
        } });

        mainmenu.add("Help/Version", { callback: () => LiteGUI.showMessage("wShade v" + WS.version, {title: "App Info"})});
        mainmenu.add("Help/Github page", { callback: () => LiteGUI.showMessage("https://github.com/jxarco", {title: "App Info"})});
        
        let w = this._mainarea.root.clientWidth - this._sidepanel.root.clientWidth - 4;
        let h = this._mainarea.root.clientHeight;
        resize(renderer, [w, h], camera);
    }

    GUI.prototype.createSidePanel = function()
    {
        this._mainarea.split("horizontal",[null,300],true);
        var docked = new LiteGUI.Panel("right_panel", {title:'Scene nodes', close: true, scroll: true});
        this._mainarea.getSection(1).add( docked );
        $(docked).bind("closed", function() { this._mainarea.merge(); });
        this._sidepanel = docked;

        this.updateSidePanel( docked, 'root' );
    }

    GUI.prototype.updateSidePanel = function( root, item_selected )
    {
        if(!item_selected)
        return;
        root = root || this._sidepanel;
        $(root.content).empty();
        
        var mytree = this.updateNodeTree(scene.root);

        var litetree = new LiteGUI.Tree(mytree, {id: "tree", allow_rename:true});

        let that = this;

        // litetree.root.addEventListener("item_dblclicked", function(e){
            
        // });

        litetree.root.addEventListener('item_selected', function(e){
            e.preventDefault();
            that.updateSidePanel( that._sidepanel, e.detail.data.id );
        });

        $(root.content).append( litetree.root );

        //side panel widget
        var widgets = new LiteGUI.Inspector();
        $(root.content).append(widgets.root);

        widgets.addSeparator();

        // update inspector depending on the tree item_selected 
        // put this apart (insane code in one function!!!!!)

        var camera = CORE.controller._camera;
        var skybox = CORE.cubemap;

        widgets.addInfo("blur back cubemap", null, {name_width: "100%"});
        widgets.addButton(null, "Test blur", {callback: () => IMPprefilter()});

        if(item_selected == 'root')
        {
            widgets.addSection("Skybox");
            widgets.addList("Environment", textures, {height: "125px", callback: function(v){
                gui.loading();
                CORE.set( v.path );
            }});
            widgets.widgets_per_row = 1;
            widgets.addSeparator();
            widgets.addTitle("Properties");
            widgets.addNumber("Rotation", renderer._uniforms["u_rotation"], {min:-720*DEG2RAD,max:720*DEG2RAD,step:0.05, callback: (v)=>renderer._uniforms["u_rotation"] = v});
            widgets.addCheckbox("Visible", skybox.flags.visible, {callback: (v) => skybox.visible = v});
            widgets.addSeparator();
            widgets.addTitle("Sampling");
            widgets.addComboButtons("Irradiance samples", CORE.blur_samples,{name_width: "40%", values:[512, 1024, 2048, 4096, 8192], callback: async (v) => {
                CORE.blur_samples = parseInt(v);
                await CORE.reloadShaders();
            }});
            widgets.addSeparator();
            widgets.addTitle("Atmospheric scattering");
            widgets.widgets_per_row = 2;
            widgets.addButton(null, "Generate",{name_width: "40%", callback: function(v) {

                if(!gl.shaders['atmos']) LiteGUI.showMessage("Error: shader missing", {title: "App info"});
                else
                {
                    CORE.cubemap.shader = "atmos";
                    CORE.cubemapToTexture( () => CORE.set(":atmos", {no_free_memory: true}) );
                }
            }});
            widgets.addButton(null, "Update", {callback: function(){
               
                if(!gl.shaders['atmos']) LiteGUI.showMessage("Error: shader missing", {title: "App info"});
                else CORE.cubemapToTexture( () => CORE.set(":atmos", {no_free_memory: true}) );
            }});
            widgets.addSeparator();
            widgets.addNumber("Sun Position", 0.4, {min: 0,step:0.01, callback: function(v){ renderer._uniforms['u_SunPos'] = v; }});
            widgets.addNumber("Mie Direction", 0.76, {min:0, max:1,step:0.01,callback: function(v){ renderer._uniforms["u_MieDirection"] = v; }});
            widgets.addNumber("Sun Intensity", 22.0, {min:0, max:50,step:0.05,callback: function(v){ renderer._uniforms["u_SunIntensity"] = v; }});
            widgets.addNumber("Mie Coefficient", 21.0, {min:0, max:50,step:0.05,callback: function(v){ renderer._uniforms["u_MieCoeff"] = v; }});
            widgets.widgets_per_row = 1;
            widgets.addNumber("Origin Offset", 0.0, {step: 50, min: 0,max: 7000, callback: function(v){ renderer._uniforms["u_originOffset"] = v; }});

            widgets.addSection("Controller");

            widgets.addVector3("Position",  camera.position, {callback: function(v){
                camera.position = v;
            }});
            widgets.addVector3("Target", camera.target, {callback: function(v){
                camera.target = v;
            }});
            widgets.addSeparator();
            widgets.widgets_per_row = 2;
            widgets.addNumber("Near", camera.near, {min:0, callback: function(v){
                camera.near = v;
            }});
            widgets.addNumber("Far", camera.far, {min:100, callback: function(v){
                camera.far = v;
            }});
            widgets.addSeparator();
            widgets.addButton(null, "Get current", {callback: () => this.updateSidePanel(this._sidepanel, 'root')});

            widgets.widgets_per_row = 1;
            widgets.addSeparator();
            widgets.addSlider("Mouse Speed", CORE.controller._mouse_speed, {min: 0.01, max: 1, step: 0.01, callback: function(v){
                CORE.controller._mouse_speed = v;
                CORE.controller.setBindings(renderer.context);
            }});
            widgets.addSlider("Wheel Speed", CORE.controller._wheel_speed, {min: 0.01, max: 1, step: 0.1, callback: function(v){
                CORE.controller._wheel_speed = v;
                CORE.controller.setBindings(renderer.context);
            }});
            widgets.addSection("Render");
            widgets.addCheckbox("Ambient occlusion",  renderer._uniforms["u_enable_ao"], {name_width: '50%', callback: (v) =>  renderer._uniforms["u_enable_ao"] = v });
			widgets.addCheckbox("FXAA",  WS.Components["FX"]._fxaa, {name_width: '50%', callback: (v) =>  WS.Components["FX"]._fxaa = v });
            widgets.addCheckbox("Correct Albedo",  renderer._uniforms["u_correctAlbedo"], {name_width: '50%', callback: (v) =>  renderer._uniforms["u_correctAlbedo"] = v });
            widgets.addSlider("IBL Scale", renderer._uniforms["u_ibl_intensity"], {min:0.0, max: 10,name_width: '50%', callback: (v) => renderer._uniforms["u_ibl_intensity"] = v });
            
            widgets.addSection("FX");

			widgets.addTitle("Frame");
            widgets.addNumber("Exposure", WS.Components["FX"].exposure,{min:-10,max:10,step:0.1,callback: function(v) { 
                WS.Components["FX"].exposure = v;
            }});
            widgets.addNumber("Offset", WS.Components["FX"].offset,{min:-0.5,max:0.5,step:0.01,callback: function(v) {
                WS.Components["FX"].offset = v;
            }});

            widgets.addTitle("Tonemapping");

            let tonemappers = Object.keys(CORE._tonemappers);
            let selected_tonemapper_name = WS.Components["FX"].tonemapping;
            let selected_tonemapper = CORE._tonemappers[ selected_tonemapper_name ];

            widgets.addCombo(null, selected_tonemapper_name, {values: tonemappers, callback: function(v){
                WS.Components["FX"].tonemapping = v;
                window.last_scroll = root.content.scrollTop;
                that.updateSidePanel( that._sidepanel, 'root' );
            }});
            
            if(selected_tonemapper && selected_tonemapper.params)
                for( let p in selected_tonemapper.params )
                {
                    let tm = selected_tonemapper.params[p];
                    let options = tm.options || {};

                    renderer._uniforms[ `u_${p}` ] = tm.value; 

                    widgets.addSlider(p, tm.value, {min:options.min || 0,max:options.max||1,step:options.step||0.1,name_width: '50%', callback: function(v) {  
                        renderer._uniforms[ `u_${p}` ] = v; 
                    }});
                }
            
            widgets.addSeparator();
            widgets.widgets_per_row = 1;
            widgets.addTitle("Glow");
            widgets.addCheckbox("Enable", WS.Components["FX"].glow_enable, {callback: function(v) { WS.Components["FX"].glow_enable = v; } });
            widgets.addSlider("Intensity", WS.Components["FX"].glow_intensity, {min:1,max:2,step:0.1,callback: function(v) {  WS.Components["FX"].glow_intensity = v; }});
            widgets.widgets_per_row = 2;
            widgets.addNumber("Threshold", WS.Components["FX"].glow_threshold, {min:0,max:500000,step:0.1,callback: function(v) { WS.Components["FX"].glow_threshold = v; }});
            widgets.addCombo("Iterations", WS.Components["FX"].glow_iterations, {values: [4, 8, 16],callback: function(v) { WS.Components["FX"].glow_iterations = v; }});
            widgets.widgets_per_row = 1;
            widgets.addSeparator();
            widgets.addSeparator();
            //widgets.addSeparator();
        }
        else if(item_selected == 'light')
        {
            widgets.addSection("Light");
            widgets.widgets_per_row = 2;
            widgets.addCheckbox("Show node", light.visible, {callback: (v) => light.visible = v });
            widgets.addNumber("Size", light.scaling[0], {step: 0.01, callback: (v) => light.scaling = v });
            widgets.widgets_per_row = 1;
            widgets.addColor("Color", WS.Components.LIGHT.color, {callback: function(color){ 
                WS.Components.LIGHT.color = color;
            }});
            widgets.addSlider("Scale", WS.Components.LIGHT.intensity, {min:0,max:10,step:0.1,callback: function(v) {  
                WS.Components.LIGHT.intensity = v; 
            }});
            widgets.addVector3("Position", WS.Components.LIGHT.position, { callback: (v) => WS.Components.LIGHT.position = v });
            widgets.addButton(null, "Get position", {callback: () => this.updateSidePanel(this._sidepanel, 'light')});
        }
        
        else if(item_selected.includes("scale") || item_selected.includes("matrix"))
        {
            let node = CORE.getByName(item_selected);
            widgets.addSection("Transform");
            widgets.addVector3("Position", node.position, {callback: function(v){ node.position = v; }});
            widgets.addNumber("Uniform scale", node.scaling[0], {min: 0.1, callback: function(v){ node.scaling = v; }});
            widgets.widgets_per_row = 3;
            widgets.addButton(null, "Reset", {callback: function(v){
                node.scaling = 1; 
                node.position = [0, 0, 0];
                that.updateSidePanel(that._sidepanel, item_selected);
            }});
            widgets.widgets_per_row = 1;
            widgets.addSection("Properties");
            widgets.addColor("Base color", renderer._uniforms["u_albedo"], {callback: function(color){ renderer._uniforms["u_albedo"] = color;}});
        }
        else if(item_selected.includes("-")) // is a primitive uid
        {
            let node = CORE.getByName(item_selected);
           
            widgets.addTitle(node.mesh);
            widgets.addSection("Transform");
            widgets.addVector3("Position", node.position, {callback: function(v){ node.position = v; }});
            widgets.addNumber("Uniform scale", node.scaling[0], {step: 0.01, min: 0.1, callback: function(v){ node.scaling = v; }});
            widgets.addButton(null, "Set camera", {callback: ()=> {

                let bb = gl.meshes[node.mesh].getBoundingBox();
                let center = BBox.getCenter(bb);
                let radius = BBox.getRadius(bb);

                let globalMat = node.getGlobalMatrix();
                let result = vec3.create();
                vec3.transformMat4( result, center, globalMat );

                CORE.controller._camera.lookAt([ 0, radius * 0.5, radius * 2.5 ], result, RD.UP);
            }});
            this.addMaterial(widgets, node);
        }

        // update scroll position
        root.content.scrollTop = window.last_scroll || 0;
        window.last_scroll = 0;
    }

    GUI.prototype.addMaterial = function(inspector, node)
    {
        // Parent node is abstract
        if(node.children.length)
        node = node.children[0];

        inspector.addSection("Material");
        inspector.addTitle("PBR properties");
        inspector.addColor("Base color", node._uniforms["u_albedo"], {callback: color => node._uniforms["u_albedo"] = color });
        inspector.addSlider("Roughness", node._uniforms['u_roughness'],{min:0,max:1,step:0.01,callback: v => node._uniforms['u_roughness'] = v });
        inspector.addSlider("Metalness", node._uniforms['u_metalness'],{min:0,max:1,step:0.01,callback: v => node._uniforms['u_metalness'] = v });
        
        inspector.addTitle("Textures")
        inspector.addNumber("Bump scale", node._uniforms['u_bumpScale'],{name_width: "50%", min:0,max:5,step:0.01, callback: v => node._uniforms['u_bumpScale'] = v });
        inspector.addNumber("Emissive scale", node._uniforms['u_emissiveScale'],{name_width: "50%", min:0,max:100,step:0.05, callback: v => node._uniforms['u_emissiveScale'] = v });
        inspector.addSeparator();

        // TODO: añadir solo si hay!!!

        const filtered = Object.keys(node.textures)
            .filter(key => !key.includes("env") && !key.includes("brdf"))
            .reduce((obj, key) => {
                obj[key] = node.textures[key];
                return obj;
            }, {});


        inspector.widgets_per_row = 2;

        for(let t in filtered) {
            inspector.addString( t, node.textures[t], {width: "85%"});
            inspector.addButton( null, '<i style="font-size: 16px;" class="material-icons">delete_forever</i>', {micro: true, width: "15%", callback: () => { 

                delete gl.textures[ node.textures[t] ]; 
                delete node.textures[t]; 
                // update properties
                node.setTextureProperties();              
                this.updateSidePanel(null, node.name) }});
        }
    }

    GUI.prototype.updateNodeTree = function(root)
    {
        var mytree = {'id': "root"};
        let children = [];

        for(var i = 1; i < root.children.length; i++)
        {
            let node = root.children[i];
            let child = {};
            if(node.name == "lines") continue;
            child['id'] = node.name;
            if(node.children.length)
            {
                let children_ = [];

                for(var j = 0; j < node.children.length; j++)
                {
                    let node_ = node.children[j];
                    let child_ = {};
                    child_['id'] = node_.name;
                    children_.push(child_);
                }

                // child['children'] = children_;
            }

            children.push(child);
        }

        mytree['children'] = children;
        return mytree;
    }

    /**
    * Export scene dialog
    * @method onExport
    */
    GUI.prototype.onExport = function()
    {
        const isInServer = Object.keys(textures).filter(key => textures[key].path.includes( CORE._environment )).length;

        // is not in server
        if(!isInServer) {
            LiteGUI.alert("Files not in server");
            return;
        }
        let boo = CORE.toJSON ? CORE.toJSON() : {};

        var inner = (v) => {
            var data = "text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(boo));
            var element = document.createElement('a');
            element.href = 'data:' + data;
            element.download = v !== "" ? `${v}.json` : `noname-${getDate()}.json`;
            element.style.display = 'none';
            $(document.body).append(element);
            element.click();
        };

        LiteGUI.prompt("Save as:", inner, {title: "Save scene", width: 270});
    }

    /**
    * Import scene dialog
    * @method onExport
    * @param {File} file
    */
    GUI.prototype.onImport = function(file)
    {

        var id = "Load scene"
        var dialog_id = id.replace(" ", "-").toLowerCase();
        var w = 400;
        var dialog = new LiteGUI.Dialog( {id: dialog_id, parent: "body", close: true, title: id, width: w, draggable: true });
        dialog.show('fade');
        dialog.makeModal('fade');
        var widgets = new LiteGUI.Inspector();

        var json = null;
        var only_settings = false;

        widgets.on_refresh = function(){

            widgets.clear();
            if(!file) {
                widgets.addFile( "Scene", "", {callback: (v) => json = v });
                widgets.addSeparator();
            }else
                widgets.addTitle( file.name );
            widgets.widgets_per_row = 2;
            widgets.addCheckbox("Only settings", only_settings, {width: "65%", name_width: "50%", callback: (v)=>only_settings = v});
            widgets.addButton( null, "Import all scene", {width: "35%", callback:()=> {
                
                if(!json && !file) 
                    return;
                var reader = new FileReader();
                reader.onload = function (e) {
                    // gui
                    $(`#${dialog_id}`).remove();
                    LiteGUI.showModalBackground(false);
                    //
                    let res = JSON.parse(e.target.result);
                    CORE.fromJSON(res, only_settings);
                };
                reader.readAsText(file ? file : json.file);
                return false;
            } });

        }
    
        widgets.on_refresh();
        dialog.add(widgets);  
        var w = 400;
        dialog.setPosition( window.innerWidth/2 - w/2, window.innerHeight/2 - 50 );       
    }

    /**
    * Renders some GUI things
    * @method render
    */
    GUI.prototype.render = function()
    {
        if(this._canvas2d && this._fps_enable)
            this.renderFPS();
    }

    /**
    * Hide fps counter
    * @method closeFPS
    */
    GUI.prototype.closeFPS = function()
    {
        this._canvas2d.style.display = "none";
    }

    /**
    * Renders FPS on screen
    * @method renderFPS
    * @param {number} padding
    */
    GUI.prototype.renderFPS = function(padding)
    {
        var now = getTime();
        var elapsed = now - this._last_time;

        this._frames++;

        if(elapsed > this._refresh_time)
        {
            this._last_fps = this._frames;
            this._frames = 0;
            this._last_time = now;

            this._fps = this._last_fps * (1000 / this._refresh_time);
        }

        var ctx = this._canvas2d.getContext("2d");
        // ctx.globalAlpha = 0.65;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "#FFF";
        ctx.font = "70px Monospace";
        ctx.fillText( "FPS:" + this._fps, 35, 95 );
    }
    
    /**
    * Register log message
    * @method log
    * @param {string} text
    */
    GUI.prototype.log = function(text)
    {
        if(text == null)
            return;

        $("#log").append( "<br>" + text );
    }
    
    /**
    * Shows message on canvas
    * @method canvasMessage 
	* @param {string} text
    */
    GUI.prototype.canvasMessage = function(text, options)
    {
        var element = document.createElement('div');
		element.className = "canvas-message";
		element.innerHTML = text;
		document.body.appendChild( element );

		if(options && options.load_bar) {
			
			var sub = document.createElement('div');
			sub.className = "canvas-message-bar";
			// sub text location
			element.style.padding = "0px";
			element.innerHTML = '';
			sub.innerHTML = text;
			// 
			element.appendChild( sub );
		}
		
		return element;
    }

	/**
    * Shows loading image on screen
    * @method loading
    * @param {bool} active
    * @param {Function} oncomplete
    */
    GUI.prototype.loading = function(disable, oncomplete)
    {
        if(disable == null)
            $("#modal").fadeIn();
        else
            $("#modal").fadeOut( oncomplete );        
    }
    
    /**
    * @method onDragFile
    * @param {File} file
    * @param {String} extension
    */
    GUI.prototype.onDragFile = function(file, extension)
    {
        if(!extension)
            throw('file not valid: missing extension');
        
        var that = this;

        switch(extension)
        {
            case 'json':
                gui.onImport(file);
                break;
            case 'obj':
                gui.onDragMesh( file );
                break;
            case 'hdre':
            case 'exr':
                this.onDragEnvironment(file);
                break;
            case 'png':
            case 'jpg':
                var reader = new FileReader();
                reader.onprogress = (e) =>  $("#xhr-load").css("width", parseFloat( (e.loaded)/e.total * 100 ) + "%");
                reader.onload = function (event) {
                    that.onDragTexture(file, event.target.result);
                };
                reader.readAsDataURL(file);
                return false;
        }
    }

    /**
    * Environment dialog
    * @method onDragEnvironment
    * @param {File} file 
    */
    GUI.prototype.onDragEnvironment = function(file)
    {
        var filename = file.name;

        var id = "Environment Drop"
        var dialog_id = id.replace(" ", "-").toLowerCase();
            
        var w = 400;
        var dialog = new LiteGUI.Dialog( {id: dialog_id, parent: "body", title: id, close: true, width: w, draggable: true });
        dialog.show('fade');

        var widgets = new LiteGUI.Inspector();

        var params = {
            filename: filename,
            size: 256,
            max: false,
        };

        widgets.on_refresh = function(){

            widgets.clear();
            widgets.addString( "File", filename );
            if( !filename.includes('hdre') )
            {
                widgets.addCombo( "Cubemap size", params.size,{width: "60%", name_width: "50%", values: ["64","128","256","512"], callback: function(v) {      
                    params["size"] = parseInt(v);
                }});
            }
            widgets.addSeparator();
            widgets.addButton( null, "Load", {width: "100%", name_width: "50%", callback: function(){
                
                $("#"+dialog_id).remove();
                gui.loading();
        
                var reader = new FileReader();
                reader.onprogress = (e) =>  $("#xhr-load").css("width", parseFloat( (e.loaded)/e.total * 100 ) + "%");
                reader.onload = async function (event) {
                    var data = event.target.result;
                    params['data'] = data;
                    params['oncomplete'] = () => CORE.set( filename );

					default_shader_macros['EM_SIZE'] = params["size"];
					await CORE.reloadShaders();

                    if(filename.includes(".exr"))
                        HDRTool.prefilter( filename, params);     
                    else
                        HDRTool.load( filename, params); 
                };
        
                reader.readAsArrayBuffer(file);
                return false;
            }});
        }
    
        widgets.on_refresh();
        dialog.add(widgets);  
        var w = 400;
        dialog.setPosition( renderer.canvas.width/2 - w/2, renderer.canvas.height/2 - renderer.canvas.height/4 );       
    }
    
    /**
    * Texture dialog
    * @method onDragTexture
    * @param {File} file 
    * @param {base64 string} data 
    */
    GUI.prototype.onDragTexture = function(file, data)
    {
        var filename = file.name;

        var id = `Texture Drop ${simple_guidGenerator()}`;
        var dialog_id = replaceAll(id, ' ', '').toLowerCase();
        var w = 400, that = this;
        var dialog = new LiteGUI.Dialog( {id: dialog_id, parent: "body", title: id, close: true, width: w, draggable: true });
        dialog.show('fade');

        var widgets = new LiteGUI.Inspector();

        var params = {
            texture_type: "Albedo"
        };

        if(includes(filename, ['albedo', 'color', 'dif'])) params.texture_type = 'Albedo';
        if(includes(filename, ['normal'])) params.texture_type = 'Normal';
        if(includes(filename, ['roughness', 'rough'])) params.texture_type = 'Roughness';
        if(includes(filename, ['metalness', 'metallic'])) params.texture_type = 'Metalness';
        if(includes(filename, ['ao', 'occlusion'])) params.texture_type = 'AO';
        if(includes(filename, ['emissive'])) params.texture_type = 'Emissive';
        if(includes(filename, ['height'])) params.texture_type = 'Height';

        widgets.on_refresh = function(){

            widgets.clear();
            widgets.addString( "File", filename );
            widgets.addCombo( "Use as", params.texture_type,{width: "60%", name_width: "50%", values: ["Albedo","Normal","Roughness","Metalness", "AO", "Emissive", "Height"],
                callback: (v) => params["texture_type"] = v
            });
            widgets.addSeparator();
            widgets.addButton( null, "Apply", {width: "100%", name_width: "50%", callback: function(){
                
                var node = WS.Components.PICK.selected;

                if(!node && CORE._root.children.length == 2)
                    node = CORE._root.children[1];

                if(!node) {
                    LiteGUI.showMessage("select node", {title: "Error"});
                    return;
                }

                var texture_name = filename;
                var texture = new Texture.fromURL(data, {}, async (tex, url) => {
                    gl.textures[ texture_name ] = tex;
                    node.textures[ type ] = texture_name;
                    node.setTextureProperties();
                    that.updateSidePanel(null, node.name);
                });

                var type = params.texture_type.toLowerCase();

                if(!texture)
                console.error('texture not loaded!!');
                
                $(`#${dialog_id}`).remove();
            }});
        }
    
        widgets.on_refresh();
        dialog.add(widgets);  
        var w = 400;
        dialog.setPosition( renderer.canvas.width/2 - w/2, renderer.canvas.height/2 - renderer.canvas.height/4 );               
    }

    /**
    * OBJ dialog
    * @method onDragMesh
    * @param {string} filename
    * @param {..} resource
    */
    GUI.prototype.onDragMesh = function(file, resource)
    {
        var filename = file.name;

        var id = "Mesh Drop";
        var dialog_id = replaceAll(id, ' ', '').toLowerCase();
        var w = 400;
        var dialog = new LiteGUI.Dialog( {id: dialog_id, parent: "body", title: id, close: true, width: w, draggable: true });
        dialog.show('fade');

        var widgets = new LiteGUI.Inspector();
        widgets.on_refresh = function(){

            widgets.clear();
            widgets.addString( "File", filename );
            widgets.addSeparator();
            widgets.addTitle("Select textures", {collapsed: true});
            widgets.widgets_per_row = 2;
            widgets.addFile( "Albedo", "", {callback: (d)=>console.log(d)} );
            widgets.addFile( "Normal", "", {callback: (d)=>console.log(d)} );
            widgets.addFile( "Roughness", "", {callback: (d)=>console.log(d)} );
            widgets.addFile( "Metalness", "", {callback: (d)=>console.log(d)} );
            widgets.widgets_per_row = 1;
            widgets.addSeparator();
            widgets.addButton( null, "Load", {width: "100%", name_width: "50%", callback: function(){
                $("#"+dialog_id).remove();
                ImporterModule.processFileList([file], {}, (f, res) => CORE.addMesh(res, f));
            }});
        }

        widgets.on_refresh();
        dialog.add(widgets);  
        var w = 400;
        dialog.setPosition( renderer.canvas.width/2 - w/2, renderer.canvas.height/2 - renderer.canvas.height/4 );                  
    }

    /**
    * Responsible for camera movement and event bindings
    * @class Controller
    * @constructor
    */
    function Controller(context, o)
    {
        if(this.constructor !== WS.Controller)
            throw("Use new to create WS.Controller");
        this._ctor(context);
        if(o)
            this.configure(o);
    }
    
    WS.Controller = Controller;
    
    Controller.prototype._ctor = function( context )
    {
        this._fov = 45;
        this._near = 0.35;
        this._far = 10000;
        this._aspect = gl.canvas.width / gl.canvas.height;

        
        this._eye = [0, 5, 5];
        this._target = [0, 5, 0];
        this._up = [0, 1, 0];
        
        this._camera = new RD.Camera();
        this._camera.perspective( this._fov, this._aspect, this._near, this._far);
        this._camera.lookAt( this._eye, this._target, this._up );

        // events
        this._context = context;
        this._mouse_speed = 0.25;
        this._wheel_speed = 0.05;
        this.setBindings();
    }

    Controller.prototype.reset = function()
    {
        this._fov = 45;
        this._near = 0.35;
        this._far = 10000;
        this._aspect = gl.canvas.width / gl.canvas.height;
        
        this._eye = [0, 5, 5];
        this._target = [0, 5, 0];
        this._up = [0, 1, 0];
        
        this._camera.perspective( this._fov, this._aspect, this._near, this._far);
        this._camera.lookAt( this._eye, this._target, this._up );

        // events
        this._mouse_speed = 0.25;

        gui.updateSidePanel(null, 'root');
    }
    
    Controller.prototype.configure = function(o)
    {
        o = o || {};
        this._camera.perspective( o.fov || this._fov, o.aspect || this._aspect , o.near || this._near, o.far || this._far);
        this._camera.lookAt( o.eye || this._eye, o.target || this._target, o.up || this._up );
    }
    
    /**
    * Performs camera lookAt
    * @method lookAt
    * @param {vec3} eye
    * @param {vec3} center
    * @param {vec3} up
    */
    Controller.prototype.lookAt = function(eye, center, up)
    {
        this._camera.lookAt( eye, center, up );
    }

    /**
    * Returns controller's camera position
    * @method getCameraPosition
    */
    Controller.prototype.getCameraPosition = function()
    {
        return this._camera.position;
    }

    /**
    * Set key bindings
    * @method setBindings
    * @param {WebGLRenderingContext} ctx
    */
    Controller.prototype.setBindings = function()
    {
        var ctx = this._context;
        if(!ctx)
            throw('no WebGLRenderingContext');

        let camera = this._camera;
        let s = this._mouse_speed;
        let w = this._wheel_speed;

        ctx.captureKeys(true);
        ctx.onkeydown = function(e)
        {
            if(e.keyCode === 82) // R
                CORE.reloadShaders(); 
            if(e.keyCode === 46) // SUPR
            {
                WS.Components.PICK.delete();
                gui.updateSidePanel(null, "root");
            }
            if(e.keyCode === 8) // DELETE
            {
                WS.Components.PICK.delete();
                gui.updateSidePanel(null, "root");
            }
            if(e.keyCode === 27) // ESC
            {
                WS.Components.PICK.selected = null;
                delete gl.meshes['lines'];
                gui.updateSidePanel(null, "root");
            }
        }
        ctx.captureMouse(true);

        ctx.onmousemove = function(e)
        {
            var mouse = [e.canvasx, gl.canvas.height - e.canvasy];
            let x = parseInt(mouse[0]), y = parseInt(mouse[1]);

            if (ctx.keys["C"]) {
                //document.querySelector("#pixelPickerCoord").innerHTML = `x: ${x} y: ${y}`;
                var pixelColor = getPixelFromMouse(x, y);
                document.querySelector("#pixelPickerText").innerHTML = `R: ${pixelColor[0].toFixed(4)} G: ${pixelColor[1].toFixed(4)} B: ${pixelColor[2].toFixed(4)}`;
            }

            if(!e.dragging) return;

            if (e.leftButton && !ctx.keys["M"]) {

                //let last = camera.position.clone();

                camera.orbit(-e.deltax * _dt * s, RD.UP,  camera._target);
                camera.orbit(-e.deltay * _dt * s, camera._right, camera._target );

                //vec3.lerp( camera.position, camera.position, last, 0.2 );
            }
            
            if (e.rightButton && ctx.keys["L"]) {
                camera.moveLocal([-e.deltax * s * 0.75 * _dt, e.deltay * _dt, 0]);
            }

            if (e.leftButton && ctx.keys["M"]) {
                
                let dx = e.deltax * _dt;
                let dy = -e.deltay * _dt;
                let node = WS.Components.PICK.selected;

                if(!node) return;

                let delta = vec3.fromValues(dx, dy, -(dx+dy));
                node.translate(delta);

                if(node.name === 'light')
                    WS.Components.LIGHT.position = node.position;
            }
        }

        ctx.onmousewheel = function(e)
        {
            if(!e.wheel)
                return;

            var amount =  (1 + e.delta * -w);
            changeCameraDistance(amount, camera);
        }
        ctx.onmousedown = function(e){
        
            if(e.leftButton )
            {
                var result = vec3.create();
                var ray = camera.getRay( e.canvasx, e.canvasy );
                var node = CORE.scene.testRay( ray, result, undefined, 0x1, true );
                
                if(node) 
                {
                    WS.Components.PICK.select(node);
                    // parent is not the scene root
                    let name = node.name;
                    if(!name)
                        name = node.parentNode.name;
                    gui.updateSidePanel(null, name);
                }
            }

            if(e.rightButton && !ctx.keys["L"])
            {

                var shaded_models = [];

                for(let s in scenes)
                    shaded_models.push( {title: scenes[s].name, callback: () => {
                        CORE.parse( scenes[s].name );
                        gui.updateSidePanel(null, scenes[s].name);
                    }});

                var actions = [
                {
                    title: "Shade model", //text to show
                    has_submenu: true,
                    submenu: {
                        options: shaded_models
                    }
                },
                {
                    title: "Add primitive", //text to show
                    has_submenu: true,
                    submenu: {
                        options: 
                        [{
                            title: "Sphere",
                            callback: () => CORE.addPrimitive("sphere")
                        },{
                            title: "Plane",
                            callback: () => CORE.addPrimitive("plane")
                        },{
                            title: "Cube",
                            callback: () => CORE.addPrimitive("cube")
                        }]
                    }
                    
                },
                {
                    title: "Add light", //text to show
                    callback: () => CORE.addLight()
                }
                ];
                var contextmenu = new LiteGUI.ContextMenu( actions, { event: e });
            }
        }
    }
    
    /**
    * Update key bindings
    * @method update
    * @param {number} dt
    * @param {WebGLRenderingContext} ctx
    */
    Controller.prototype.update = function(dt, ctx)
    {
        if(!ctx)
            throw('no WebGLRenderingContext');

        let w = this._wheel_speed * 25;
        var s = CORE.selected_radius ? CORE.selected_radius * w : w;

        if(ctx.keys["UP"] || ctx.keys["W"]){            this._camera.moveLocal([0,0,-dt * s]);}
        else if(ctx.keys["DOWN"] || ctx.keys["S"]){     this._camera.moveLocal([0,0,dt * s]);}

        if(ctx.keys["RIGHT"] || ctx.keys["D"]){         this._camera.moveLocal([dt * s,0,0]);}
        else if(ctx.keys["LEFT"] || ctx.keys["A"]){     this._camera.moveLocal([dt * -s,0,0]);}

        if(ctx.keys["SPACE"]){                              this._camera.moveLocal([0,dt * s,0]);}
        else if(ctx.keys["SHIFT"]){                         this._camera.moveLocal([0,dt * -s,0]);}
    }
    
    //footer
    
    })( typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ) );
    
    
    