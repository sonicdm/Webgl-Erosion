import * as THREE from 'three';
// @ts-ignore
import { PerspectiveCamera } from 'three';
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";

import {vec3, mat4} from 'gl-matrix';
// @ts-ignore

import {Vector3} from "three";
import { ControlsConfig } from './controls-config';




class Camera {

  threeControls : any;
  threeCamera : any;

  worldUp : vec3 = vec3.fromValues(0,1,0);
  projectionMatrix: mat4 = mat4.create();
  viewMatrix: mat4 = mat4.create();
  fovy: number = 45;
  aspectRatio: number = 1;
  near: number = 0.01;
  far: number = 500;
  position: vec3 = vec3.create();
  direction: vec3 = vec3.create();
  target: vec3 = vec3.create();
  up: vec3 = vec3.fromValues(0.0, 1.0, 0.0);
  counter : number = 0;

  tposition : Vector3 = new Vector3(0,0,0);
  tdirection : Vector3 = new Vector3(0,0,0);
  tup : Vector3 = new  Vector3(0,0,0);

  // Key tracking for WASD movement
  private pressedKeys: Set<string> = new Set();
  private lastUpdateTime: number = performance.now();
  
  // Velocity tracking for smooth acceleration/deceleration
  private velocity: vec3 = vec3.create();
  
  // Smoothed deltaTime for consistent movement at variable frame rates
  private smoothedDeltaTime: number = 0.016; // Start with ~60 FPS (16ms)
  private readonly deltaTimeSmoothingFactor: number = 0.05; // EMA factor (lower = more smoothing, reduced from 0.1 for more stability)

  constructor(position: vec3, target: vec3, cameraConfig?: ControlsConfig['camera'], brushUsesLeftClick?: boolean) {


    vec3.subtract(this.direction, target, position);

    this.tposition = new Vector3(position[0], position[1],position[2]);
    this.tdirection = new Vector3(this.direction[0], this.direction[1],this.direction[2]);
    this.tup = new Vector3(this.up[0], this.up[1],this.up[2]);



    this.threeCamera = new PerspectiveCamera(this.fovy,this.aspectRatio,this.near,this.far);
    this.threeCamera.position.set(position[0],position[1],position[2]);
    this.threeControls = new OrbitControls(this.threeCamera, document.getElementById('canvas'));

    // Apply camera configuration if provided
    if (cameraConfig) {
        // Configure mouse button mappings
        const mouseButtons: any = {
            LEFT: null,
            MIDDLE: null,
            RIGHT: null
        };
        // If brush uses left click, ensure LEFT is disabled for camera
        if (brushUsesLeftClick) {
            console.log('[DEBUG] Camera: Disabling LEFT button for OrbitControls (brush uses it)');
            mouseButtons.LEFT = null;
        }
        // Set rotate button (unless it's LEFT and brush uses it)
        if (cameraConfig.rotateButton) {
            if (!brushUsesLeftClick || cameraConfig.rotateButton !== 'LEFT') {
                mouseButtons[cameraConfig.rotateButton] = THREE.MOUSE.ROTATE;
            }
        }
        // Set pan button (unless it's LEFT and brush uses it)
        if (cameraConfig.panButton) {
            if (!brushUsesLeftClick || cameraConfig.panButton !== 'LEFT') {
                mouseButtons[cameraConfig.panButton] = THREE.MOUSE.PAN;
            }
        }
        this.threeControls.mouseButtons = mouseButtons;
        console.log('[DEBUG] Camera: OrbitControls mouseButtons set to:', mouseButtons);

        // Apply speed settings
        this.threeControls.rotateSpeed = cameraConfig.rotateSpeed;
        this.threeControls.zoomSpeed = cameraConfig.zoomSpeed;
        this.threeControls.panSpeed = cameraConfig.panSpeed;

        // Apply enable/disable settings
        this.threeControls.enableRotate = cameraConfig.enableRotate;
        this.threeControls.enablePan = cameraConfig.enablePan;
        this.threeControls.enableZoom = cameraConfig.enableZoom;

        // Apply damping settings
        this.threeControls.enableDamping = cameraConfig.enableDamping;
        this.threeControls.dampingFactor = cameraConfig.dampingFactor;
    } else {
        // Default settings
        this.threeControls.enableDamping = true;
        this.threeControls.dampingFactor = 0.08;
    }
    
    // Disable OrbitControls' built-in keyboard controls (we handle WASD ourselves)
    this.threeControls.keys = {
        LEFT: null,
        UP: null,
        RIGHT: null,
        BOTTOM: null
    };
    console.log( this.threeCamera.position);



    this.threeControls.update();


    vec3.add(this.target, this.position, this.direction);


    let wd = new Vector3();
    this.threeCamera.getWorldDirection(wd);
    this.direction = vec3.fromValues(wd.x,wd.y,wd.z);
    this.position = vec3.fromValues(this.threeCamera.position.x,this.threeCamera.position.y,this.threeCamera.position.z);
    vec3.add(this.target, this.position, this.direction);

    let lookatVec = vec3.fromValues(0,0,0);
    vec3.subtract(lookatVec,this.position, this.target);
    let tmpRight = vec3.fromValues(0,0,0);
    let camUp = vec3.fromValues(0,0,0);
    vec3.cross(tmpRight, this.worldUp,lookatVec);
    vec3.cross(camUp,tmpRight,lookatVec);
    vec3.normalize(camUp,camUp);
    vec3.scale(camUp,camUp,-1);

    this.up = camUp;


    mat4.lookAt(this.viewMatrix, this.position, this.target, vec3.fromValues(0,1,0));
  }

  setAspectRatio(aspectRatio: number) {
    this.aspectRatio = aspectRatio;
  }

  updateProjectionMatrix() {
    mat4.perspective(this.projectionMatrix, this.fovy, this.aspectRatio, this.near, this.far);
  }

  // Movement key tracking methods
  addMovementKey(key: string): void {
    this.pressedKeys.add(key.toLowerCase());
  }

  removeMovementKey(key: string): void {
    this.pressedKeys.delete(key.toLowerCase());
  }

  isMovementKeyPressed(key: string): boolean {
    return this.pressedKeys.has(key.toLowerCase());
  }

  // Update movement based on pressed keys with acceleration/deceleration
  updateMovement(deltaTime: number, config: ControlsConfig['camera']): void {
    if (!config.movement.enableWASD) {
      return;
    }


    // Acceleration and deceleration constants (reduced for smoother movement at high frame rates)
    // Further reduced for smoother movement at variable frame rates
    const acceleration = 2.0;  // Units per second squared (reduced from 4.0 for smoother movement)
    const deceleration = 3.0;   // Units per second squared (reduced from 6.0 for smoother stopping)
    const maxSpeed = config.movement.moveSpeed;
    const fastMaxSpeed = maxSpeed * (config.movement.fastMoveMultiplier || 3.0);

    // Ensure camera matrix is up to date before calculating direction
    // This is important at higher resolutions where matrix updates might be delayed
    this.threeCamera.updateMatrixWorld();

    // Calculate movement vectors using camera's world direction
    const forward = vec3.create();
    const right = vec3.create();
    const up = vec3.create();
    const desiredDirection = vec3.create();

    // Get camera's forward direction in world space using getWorldDirection
    // Cache the direction calculation to avoid inconsistencies
    const threeForward = new Vector3();
    this.threeCamera.getWorldDirection(threeForward);
    
    // Remove Y component for horizontal movement only
    threeForward.y = 0;
    const forwardLength = threeForward.length();
    
    // Check if forward vector is valid (not too small)
    if (forwardLength < 0.001) {
      // Camera is looking straight up/down, use last valid forward or default
      // For now, use a default forward direction
      threeForward.set(0, 0, -1);
    } else {
      threeForward.normalize();
    }
    
    forward[0] = threeForward.x;
    forward[1] = 0;
    forward[2] = threeForward.z;
    const forwardLen = vec3.length(forward);
    if (forwardLen > 0.001) {
      vec3.normalize(forward, forward);
    } else {
      vec3.set(forward, 0, 0, -1);
    }

    // Right vector is perpendicular to forward (strafe direction)
    // Use forward crossed with world up to get proper right vector
    // cross(forward, up) gives right, cross(up, forward) gives left
    const threeRight = new Vector3();
    const worldUpVec = new Vector3(0, 1, 0);
    threeRight.crossVectors(threeForward, worldUpVec); // Fixed order: forward x up = right
    threeRight.y = 0; // Keep horizontal
    const rightLength = threeRight.length();
    
    if (rightLength < 0.001) {
      // Fallback if forward is parallel to up - use perpendicular to forward
      threeRight.set(-threeForward.z, 0, threeForward.x);
      const fallbackLength = threeRight.length();
      if (fallbackLength > 0.001) {
        threeRight.normalize();
      } else {
        threeRight.set(1, 0, 0);
      }
    } else {
      threeRight.normalize();
    }
    
    right[0] = threeRight.x;
    right[1] = 0;
    right[2] = threeRight.z;
    const rightLen = vec3.length(right);
    if (rightLen > 0.001) {
      vec3.normalize(right, right);
    } else {
      // Fallback: perpendicular to forward
      right[0] = -forward[2];
      right[1] = 0;
      right[2] = forward[0];
      const fallbackLen = vec3.length(right);
      if (fallbackLen > 0.001) {
        vec3.normalize(right, right);
      } else {
        vec3.set(right, 1, 0, 0);
      }
    }

    // Up vector is world up for vertical movement
    vec3.copy(up, this.worldUp);

    // Build desired movement direction based on pressed keys
    vec3.set(desiredDirection, 0, 0, 0);

    // W = forward (horizontal, no pitch)
    if (this.isMovementKeyPressed('w')) {
      vec3.add(desiredDirection, desiredDirection, forward);
    }
    // S = backward
    if (this.isMovementKeyPressed('s')) {
      vec3.subtract(desiredDirection, desiredDirection, forward);
    }
    // A = strafe left
    if (this.isMovementKeyPressed('a')) {
      vec3.subtract(desiredDirection, desiredDirection, right);
    }
    // D = strafe right
    if (this.isMovementKeyPressed('d')) {
      vec3.add(desiredDirection, desiredDirection, right);
    }

    // Vertical movement (if enabled)
    if (config.movement.enableVerticalMovement) {
      if (this.isMovementKeyPressed(' ')) { // Space for up
        vec3.add(desiredDirection, desiredDirection, up);
      }
      // Shift for down (only if not used as brush modifier - handled in event handlers)
      if (this.isMovementKeyPressed('shift')) {
        vec3.subtract(desiredDirection, desiredDirection, up);
      }
    }

    // Normalize desired direction if there's any input
    if (vec3.length(desiredDirection) > 0.001) {
      vec3.normalize(desiredDirection, desiredDirection);
    }

    // Determine current max speed (fast mode if Shift is held)
    const currentMaxSpeed = (this.isMovementKeyPressed('shift') && config.movement.fastMoveMultiplier > 1.0) 
      ? fastMaxSpeed 
      : maxSpeed;

    // Calculate desired velocity
    const desiredVelocity = vec3.create();
    vec3.scale(desiredVelocity, desiredDirection, currentMaxSpeed);

    // Calculate velocity change based on acceleration/deceleration
    const velocityChange = vec3.create();
    if (vec3.length(desiredDirection) > 0.001) {
      // Accelerating towards desired direction
      vec3.subtract(velocityChange, desiredVelocity, this.velocity);
      const accelRate = acceleration * deltaTime;
      vec3.scale(velocityChange, velocityChange, Math.min(accelRate, 1.0));
    } else {
      // Decelerating (no input)
      const decelRate = deceleration * deltaTime;
      vec3.scale(velocityChange, this.velocity, -Math.min(decelRate, 1.0));
    }

    // Update velocity
    vec3.add(this.velocity, this.velocity, velocityChange);

    // Clamp velocity to max speed
    const currentSpeed = vec3.length(this.velocity);
    if (currentSpeed > currentMaxSpeed) {
      vec3.scale(this.velocity, this.velocity, currentMaxSpeed / currentSpeed);
    }


    // Apply velocity to both camera position AND target to maintain orbit relationship
    // This is the key: move both together so the camera maintains its relative position
    const movementDelta = vec3.create();
    vec3.scale(movementDelta, this.velocity, deltaTime);
    
    
    // Move both camera and target together
    this.threeCamera.position.x += movementDelta[0];
    this.threeCamera.position.y += movementDelta[1];
    this.threeCamera.position.z += movementDelta[2];
    
    this.threeControls.target.x += movementDelta[0];
    this.threeControls.target.y += movementDelta[1];
    this.threeControls.target.z += movementDelta[2];

  }

  update(cameraConfig?: ControlsConfig['camera']) {
    // Calculate deltaTime for frame-rate independent movement
    const currentTime = performance.now();
    let rawDeltaTime = (currentTime - this.lastUpdateTime) / 1000.0; // Convert to seconds
    this.lastUpdateTime = currentTime;

    // Clamp raw deltaTime to prevent extreme values
    const maxDeltaTime = 0.1; // Maximum 100ms per frame (10 FPS minimum)
    rawDeltaTime = Math.min(rawDeltaTime, maxDeltaTime);
    
    // Smooth deltaTime using exponential moving average to reduce jerky movement
    // This is especially important at high resolutions where frame times can vary significantly
    this.smoothedDeltaTime = this.smoothedDeltaTime * (1.0 - this.deltaTimeSmoothingFactor) + 
                            rawDeltaTime * this.deltaTimeSmoothingFactor;
    
    // Use smoothed deltaTime for movement calculations
    const deltaTime = this.smoothedDeltaTime;

    // Update movement before OrbitControls (so movement happens first)
    if (cameraConfig) {
      this.updateMovement(deltaTime, cameraConfig);
    }

    // Update OrbitControls AFTER movement to ensure it respects the new positions
    this.threeControls.update();

    this.threeCamera.updateMatrixWorld();

    let wd = new Vector3();
    this.threeCamera.getWorldDirection(wd);
    this.direction = vec3.fromValues(wd.x,wd.y,wd.z);
    this.position = vec3.fromValues(this.threeCamera.position.x,this.threeCamera.position.y,this.threeCamera.position.z);
    vec3.add(this.target, this.position, this.direction);

    let lookatVec = vec3.fromValues(0,0,0);
    vec3.subtract(lookatVec,this.position, this.target);
    let tmpRight = vec3.fromValues(0,0,0);
    let camUp = vec3.fromValues(0,0,0);
    vec3.cross(tmpRight, this.worldUp,lookatVec);
    vec3.cross(camUp,tmpRight,lookatVec);
    vec3.normalize(camUp,camUp);
    vec3.scale(camUp,camUp,-1);
    this.up = camUp;

    this.counter ++;

    mat4.lookAt(this.viewMatrix, this.position, this.target, vec3.fromValues(0,1,0));
  }
};

export default Camera;
