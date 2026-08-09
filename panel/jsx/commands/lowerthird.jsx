// lowerthird.jsx — applyLowerThird (ES3). Faz 2 madde 5, docs/ROADMAP.md.
//
// Deliberately not a new abstraction: composes existing commands
// (resolveSafePosition, measureText, addTextLayer, applyTextStyle,
// addNull, setParent) rather than reimplementing text building or
// animation. Title + optional subtitle (decided with the user 2026-08-09:
// lower-thirds get a subtitle line by default, not single-line-only),
// controller null, LT_* names, single in/out.
//
// Positioning is manual (measureText-derived), NOT the applyTextStyle/
// _makeLineLayers convention of centering on centerX — a lower-third is
// edge-anchored, not centered. That's also why wordReveal (which always
// builds its own centered multi-word layout) isn't supported here; the
// other 3 styles all accept an existing `layer` and just add the animator
// to it (see _applyPresetLines's hasLayer branch), which is what makes
// this composition possible without new plumbing.
COMMANDS.applyLowerThird = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(typeof p.title === "string" && p.title.length, "title is required");
  var style = String(p.style || "charScale").toLowerCase().replace(/[^a-z]/g, "");
  AEB.assert(style !== "wordreveal",
    "wordReveal builds its own multi-word layout and isn't compatible with applyLowerThird's " +
    "manually-anchored layers; use charScale|bunchRotate|blurFade");

  return AEB.undo("mograph-mcp: applyLowerThird", function () {
    var font = p.font || "Inter-Regular";
    var titleSize = p.titleFontSize || 70;
    var subSize = p.subtitleFontSize || 36;
    var gap = (p.gap !== undefined) ? p.gap : 14;
    var position = p.position || "bottomLeft";
    var ease = p.ease || "easeOutQuart";
    var titleColor = p.titleColor || [1, 1, 1];
    var subtitleColor = p.subtitleColor || [0.8, 0.8, 0.8];
    var inFrame = (p.inFrame !== undefined) ? p.inFrame : 0;
    var outFrame = (p.outFrame !== undefined) ? p.outFrame : inFrame + Math.round(comp.frameRate * 5);
    var subDelay = (p.subtitleDelay !== undefined) ? p.subtitleDelay : 6;
    var namePrefix = p.namePrefix || "LT";

    var safe = COMMANDS.resolveSafePosition({ compId: p.compId, position: position, safeArea: p.safeArea });

    // Same h/v parsing convention as resolveSafePosition/alignAnchor (explicit
    // if/else — NOT a chained ternary, see docs/DEVLOG.md 2026-08-09 (9)).
    var vTop, hLeft, hRight;
    if (position.indexOf("top") === 0) vTop = true; else vTop = false;
    if (position.indexOf("Left") >= 0) hLeft = true; else hLeft = false;
    if (position.indexOf("Right") >= 0) hRight = true; else hRight = false;
    var justCode; // addTextLayer's convention: 0 left, 1 right, 2 center
    if (hRight) justCode = 1; else if (hLeft) justCode = 0; else justCode = 2;

    var hasSub = (typeof p.subtitle === "string" && p.subtitle.length > 0);
    var titleM = COMMANDS.measureText({ compId: p.compId, text: p.title, font: font, fontSize: titleSize });
    var subM = hasSub ? COMMANDS.measureText({ compId: p.compId, text: p.subtitle, font: font, fontSize: subSize }) : null;
    var blockHeight = hasSub ? (titleM.height + gap + subM.height) : titleM.height;

    var blockTopY;
    if (vTop) blockTopY = safe.y;
    else blockTopY = safe.y - blockHeight;   // bottom or middle both stack from a computed top

    // x lands ink's left/right edge exactly on the safe-area x for
    // left/right anchors; center anchors need no bearing compensation
    // (CENTER_JUSTIFY text is already symmetric around Position.x, same as
    // _makeLineLayers's convention).
    function lineX(m) {
      if (hLeft) return safe.x - m.left;
      if (hRight) return safe.x - m.left - m.width;
      return safe.x;
    }

    var titleAbsX = lineX(titleM), titleAbsY = blockTopY - titleM.top;
    var subAbsX, subAbsY;
    if (hasSub) {
      subAbsX = lineX(subM);
      subAbsY = blockTopY + titleM.height + gap - subM.top;
    }

    // Controller null at the safe anchor point. Children below are built at
    // their ABSOLUTE (world) Position — NOT pre-adjusted for the null — and
    // only reparented afterward: ExtendScript's `layer.parent = X` assignment
    // auto-preserves on-screen world position by adjusting Position itself
    // (confirmed live 2026-08-09; same behavior as parenting via the AE UI's
    // default "keep position"). Pre-subtracting the null's position AND
    // letting setParent do it too double-subtracts — that was a real bug
    // caught here, not a hypothetical.
    var controller = COMMANDS.addNull({ compId: p.compId, name: namePrefix + "_controller", duration: (outFrame - inFrame) / comp.frameRate + 1 });
    var controllerLayer = AEB.resolveLayer(comp, controller.layerIndex);
    controllerLayer.property("Transform").property("Position").setValue([safe.x, safe.y]);

    var titleLayer = COMMANDS.addTextLayer({
      compId: p.compId, text: p.title, font: font, fontSize: titleSize, fillColor: titleColor,
      justification: justCode, position: [titleAbsX, titleAbsY],
      name: namePrefix + "_title"
    });
    COMMANDS.setParent({ compId: p.compId, layer: titleLayer.layerIndex, parent: controllerLayer.index });
    COMMANDS.applyTextStyle({
      compId: p.compId, layer: titleLayer.layerIndex, style: style, ease: ease,
      startFrame: inFrame, outFrame: outFrame
    });

    if (hasSub) {
      var subLayer = COMMANDS.addTextLayer({
        compId: p.compId, text: p.subtitle, font: font, fontSize: subSize, fillColor: subtitleColor,
        justification: justCode, position: [subAbsX, subAbsY],
        name: namePrefix + "_subtitle"
      });
      COMMANDS.setParent({ compId: p.compId, layer: subLayer.layerIndex, parent: controllerLayer.index });
      COMMANDS.applyTextStyle({
        compId: p.compId, layer: subLayer.layerIndex, style: style, ease: ease,
        startFrame: inFrame + subDelay, outFrame: outFrame
      });
    }

    // Re-resolve everything by NAME right before returning: comp.layers.addText()
    // always inserts at index 1, so every earlier snapshot's .layerIndex/.index
    // is stale by now (each subsequent addTextLayer call shifted it). Names are
    // stable regardless of index churn.
    var finalLayers = [AEB.layerInfo(AEB.resolveLayer(comp, namePrefix + "_title"))];
    if (hasSub) finalLayers.push(AEB.layerInfo(AEB.resolveLayer(comp, namePrefix + "_subtitle")));
    return {
      controller: AEB.layerInfo(controllerLayer),
      layers: finalLayers,
      inFrame: inFrame, outFrame: outFrame
    };
  });
};
