// app.jsx — application + project control (ES3). The "control everything" surface.
// app.executeCommand(id) runs ANY After Effects menu command (hundreds of them),
// which is the scripting equivalent of pressing menu items / keyboard shortcuts.

COMMANDS.executeMenuCommand = function (p) {
  var id = p.commandId;
  if ((id === undefined || id === null) && p.commandName) {
    id = app.findMenuCommandId(p.commandName);
    AEB.assert(id, 'menu command not found: "' + p.commandName + '"');
  }
  AEB.assert(id, "commandId or commandName is required");
  app.executeCommand(id);
  return { ok: true, commandId: id };
};

COMMANDS.findMenuCommand = function (p) {
  AEB.assert(p.commandName, "commandName is required");
  return { commandId: app.findMenuCommandId(p.commandName), commandName: p.commandName };
};

COMMANDS.saveProject = function (p) {
  if (p && p.path) app.project.save(new File(p.path));
  else if (app.project.file) app.project.save();
  else throw new Error("Project has never been saved; supply a path");
  return { path: app.project.file ? app.project.file.fsName : null };
};

// closeProject/openProject/quitApp never rely on AE's own save-changes dialog
// (dialogs freeze the bridge, same reasoning as __saveProject above). Instead
// they resolve "what happens to unsaved changes" themselves BEFORE calling
// the native close/open/quit, then always pass CloseOptions.DO_NOT_SAVE_CHANGES
// (or nothing needing saving) so the native call itself can never prompt.
function _saveOrThrow(p) {
  var proj = app.project;
  if (proj.file) { proj.save(); return; }
  if (p && p.path) { proj.save(new File(p.path)); return; }
  throw new Error("Project has unsaved content and was never saved; pass save:false to discard it, or path to save it first");
}

COMMANDS.closeProject = function (p) {
  var proj = app.project;
  var save = (p && p.save !== undefined) ? p.save : true;
  if ((proj.numItems > 0 || proj.file) && save) _saveOrThrow(p);
  proj.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  return { ok: true };
};

COMMANDS.openProject = function (p) {
  AEB.assert(p && p.path, "path is required");
  var f = new File(p.path);
  AEB.assert(f.exists, "file not found: " + p.path);
  var proj = app.project;
  var save = (p && p.save !== undefined) ? p.save : true;
  if (proj.numItems > 0 || proj.file) {
    if (save) _saveOrThrow(null); // closing project needs a path of its OWN, not the target's
    proj.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  }
  var ok = app.open(f);
  AEB.assert(ok, "failed to open project: " + p.path);
  var opened = app.project;
  return { name: opened.file ? opened.file.name : "Untitled", path: opened.file ? opened.file.fsName : null, numItems: opened.numItems };
};

// quitApp: after this call the panel/socket dies with the AE process, so the
// controller resolves the pending request as { ok:false, code:'DISCONNECTED' }
// (see controller/src/aeClient.js _onClose) instead of a normal ack — that
// disconnect IS the success signal, not a failure to be retried.
COMMANDS.quitApp = function (p) {
  var proj = app.project;
  var save = (p && p.save !== undefined) ? p.save : true;
  if ((proj.numItems > 0 || proj.file) && save) _saveOrThrow(p);
  app.quit();
  return { ok: true };
};

COMMANDS.undo = function () { app.executeCommand(16); return { ok: true }; };   // Edit > Undo
COMMANDS.redo = function () { app.executeCommand(17); return { ok: true }; };   // Edit > Redo

COMMANDS.purge = function (p) {
  var T = String((p && p.target) || "all").toLowerCase();
  var map = {
    all: PurgeTarget.ALL_CACHES, undo: PurgeTarget.UNDO_CACHES,
    snapshot: PurgeTarget.SNAPSHOT_CACHES, image: PurgeTarget.IMAGE_CACHES
  };
  app.purge(map[T] || PurgeTarget.ALL_CACHES);
  return { ok: true };
};

// Open a comp in the viewer (makes it the active item).
COMMANDS.setActiveComp = function (p) {
  var comp = AEB.requireComp(p);
  comp.openInViewer();
  return { ok: true, compId: comp.id, name: comp.name };
};

COMMANDS.getSelection = function () {
  var item = app.project.activeItem;
  if (!(item instanceof CompItem)) return { comp: null, layers: [] };
  var sel = [];
  var ls = item.selectedLayers;
  for (var i = 0; i < ls.length; i++) sel.push(AEB.layerInfo(ls[i]));
  return { comp: { id: item.id, name: item.name }, layers: sel };
};

COMMANDS.setCompTime = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.time !== undefined, "time is required");
  comp.time = p.time;
  return { ok: true, time: comp.time };
};

// App/system facts.
COMMANDS.getAppInfo = function () {
  return {
    version: app.version,
    buildName: app.buildName,
    language: app.language ? String(app.language) : null,
    projectPath: app.project.file ? app.project.file.fsName : null,
    numItems: app.project.numItems
  };
};
