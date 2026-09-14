import { generateId } from '@/lib/utils';
import { SelectionInspectorMulti } from '@/components/SelectionInspectorMulti';
import { SelectionInspectorObjectForm } from '@/components/SelectionInspectorObjectForm';
import { textDimensions } from '@/lib/canvasTextLayout';
import {
  duplicateDrawingObject,
  duplicateObjectCollection,
  expandObjectIdsWithGroups,
  recolorObjects,
  translateObject,
} from '@/lib/canvasObjectTransform';
import { getObjectBounds } from '@/lib/canvasObjectGeometry';
import { useDrawingStore, type DrawingObject } from '@/store/drawingStore';

/** Object-level controls, intentionally shared by the desktop panel and mobile drawer. */
export function SelectionInspector() {
  const {
    objects,
    selectedObjectId,
    selectedObjectIds,
    setSelectedObject,
    setSelectedObjects,
    updateObject,
    addObject,
    saveHistory,
    projectRole,
    setObjects,
    requestFullRedraw,
  } = useDrawingStore();
  const selectedObjects = objects.filter((candidate) => selectedObjectIds.includes(candidate.id));
  const isMultiSelection = selectedObjects.length > 1;
  const object = objects.find((candidate) => candidate.id === selectedObjectId);
  const isEditable = projectRole !== 'viewer';
  const hasLockedSelection = selectedObjects.some((candidate) => candidate.locked);
  const allSelectedLocked =
    selectedObjects.length > 0 && selectedObjects.every((candidate) => candidate.locked);
  const alignSelected = (axis: 'x' | 'y', edge: 'min' | 'max') => {
    const positioned = selectedObjects
      .map((object) => ({ object, bounds: getObjectBounds(object) }))
      .filter(
        (
          candidate,
        ): candidate is {
          object: DrawingObject;
          bounds: NonNullable<ReturnType<typeof getObjectBounds>>;
        } => candidate.bounds !== null,
      );
    if (!isEditable || hasLockedSelection || positioned.length < 2) return;
    const target =
      edge === 'min'
        ? Math.min(...positioned.map((candidate) => candidate.bounds[axis]))
        : Math.max(
            ...positioned.map(
              (candidate) =>
                candidate.bounds[axis] +
                (axis === 'x' ? candidate.bounds.width : candidate.bounds.height),
            ),
          );
    saveHistory();
    setObjects(
      objects.map((candidate) => {
        const selected = positioned.find((item) => item.object.id === candidate.id);
        if (!selected) return candidate;
        const farEdge =
          selected.bounds[axis] + (axis === 'x' ? selected.bounds.width : selected.bounds.height);
        const delta = target - (edge === 'max' ? farEdge : selected.bounds[axis]);
        return axis === 'x'
          ? translateObject(candidate, delta, 0)
          : translateObject(candidate, 0, delta);
      }),
    );
    requestFullRedraw();
  };

  const distributeSelected = (axis: 'x' | 'y') => {
    const positioned = selectedObjects
      .map((object) => ({ object, bounds: getObjectBounds(object) }))
      .filter(
        (
          candidate,
        ): candidate is {
          object: DrawingObject;
          bounds: NonNullable<ReturnType<typeof getObjectBounds>>;
        } => candidate.bounds !== null,
      )
      .sort((a, b) => a.bounds[axis] - b.bounds[axis]);
    if (!isEditable || hasLockedSelection || positioned.length < 3) return;
    const first = positioned[0];
    const last = positioned[positioned.length - 1];
    const firstEdge = first.bounds[axis];
    const lastEdge = last.bounds[axis] + (axis === 'x' ? last.bounds.width : last.bounds.height);
    const occupied = positioned.reduce(
      (sum, candidate) => sum + (axis === 'x' ? candidate.bounds.width : candidate.bounds.height),
      0,
    );
    const gap = (lastEdge - firstEdge - occupied) / (positioned.length - 1);
    let cursor = firstEdge;
    const positions = new Map<string, number>();
    for (const candidate of positioned) {
      positions.set(candidate.object.id, cursor);
      cursor += (axis === 'x' ? candidate.bounds.width : candidate.bounds.height) + gap;
    }
    saveHistory();
    setObjects(
      objects.map((candidate) => {
        const position = positions.get(candidate.id);
        if (position === undefined) return candidate;
        const bounds = getObjectBounds(candidate);
        if (!bounds) return candidate;
        return axis === 'x'
          ? translateObject(candidate, position - bounds.x, 0)
          : translateObject(candidate, 0, position - bounds.y);
      }),
    );
    requestFullRedraw();
  };

  const groupSelected = () => {
    if (!isEditable) return;
    const ids = expandObjectIdsWithGroups(objects, selectedObjectIds);
    if (ids.length < 2) return;
    saveHistory();
    const groupId = generateId();
    setObjects(
      objects.map((candidate) =>
        ids.includes(candidate.id) ? { ...candidate, groupId } : candidate,
      ),
    );
    setSelectedObjects(ids);
    requestFullRedraw();
  };

  const ungroupSelected = () => {
    if (!isEditable) return;
    const groupIds = new Set(
      selectedObjects
        .map((candidate) => candidate.groupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    );
    if (!groupIds.size) return;
    const ids = objects
      .filter((candidate) => candidate.groupId && groupIds.has(candidate.groupId))
      .map((candidate) => candidate.id);
    saveHistory();
    setObjects(
      objects.map((candidate) =>
        candidate.groupId && groupIds.has(candidate.groupId)
          ? { ...candidate, groupId: undefined }
          : candidate,
      ),
    );
    setSelectedObjects(ids);
    requestFullRedraw();
  };

  const toggleSelectedLocks = () => {
    if (!isEditable || selectedObjects.length === 0) return;
    saveHistory();
    const ids = new Set(selectedObjectIds);
    setObjects(
      objects.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, locked: !allSelectedLocked } : candidate,
      ),
    );
    requestFullRedraw();
  };

  const deleteSelected = () => {
    if (!isEditable || hasLockedSelection || selectedObjectIds.length === 0) return;
    const ids = new Set(selectedObjectIds);
    saveHistory();
    setObjects(objects.filter((candidate) => !ids.has(candidate.id)));
    setSelectedObject(undefined);
    requestFullRedraw();
  };

  const duplicateSelected = () => {
    if (!isEditable || hasLockedSelection || selectedObjectIds.length === 0) return;
    const ids = expandObjectIdsWithGroups(objects, selectedObjectIds);
    const copies = duplicateObjectCollection(objects, ids, generateId);
    if (copies.length === 0) return;
    saveHistory();
    setObjects([...objects, ...copies]);
    setSelectedObjects(copies.map((candidate) => candidate.id));
    requestFullRedraw();
  };

  const recolorSelected = (color: string) => {
    if (!isEditable || hasLockedSelection || selectedObjectIds.length === 0) return;
    saveHistory();
    setObjects(recolorObjects(objects, selectedObjectIds, color));
    requestFullRedraw();
  };

  if (isMultiSelection) {
    return (
      <SelectionInspectorMulti
        selectedObjects={selectedObjects}
        hasLockedSelection={hasLockedSelection}
        isEditable={isEditable}
        allSelectedLocked={allSelectedLocked}
        saveHistory={saveHistory}
        duplicateSelected={duplicateSelected}
        recolorSelected={recolorSelected}
        alignSelected={alignSelected}
        distributeSelected={distributeSelected}
        groupSelected={groupSelected}
        ungroupSelected={ungroupSelected}
        toggleSelectedLocks={toggleSelectedLocks}
        deleteSelected={deleteSelected}
        setSelectedObject={setSelectedObject}
      />
    );
  }

  if (!object) return null;

  const isReadOnly = !isEditable || Boolean(object.locked);
  const canFill = ['rectangle', 'ellipse', 'circle', 'triangle', 'star'].includes(object.type);
  const canResize =
    object.type !== 'stroke' &&
    object.type !== 'text' &&
    object.width !== undefined &&
    object.height !== undefined;

  const updateText = (nextText: string) => {
    if (nextText === object.text) return;
    saveHistory();
    const dimensions = textDimensions(nextText || ' ', object.fontSize ?? 24);
    updateObject(object.id, { text: nextText, ...dimensions });
  };

  const updateFontSize = (fontSize: number) => {
    const nextFontSize = Math.max(12, Math.min(240, Math.round(fontSize)));
    saveHistory();
    const dimensions = textDimensions(object.text || ' ', nextFontSize);
    updateObject(object.id, { fontSize: nextFontSize, ...dimensions });
  };

  const resize = (dimension: 'width' | 'height', rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateObject(object.id, { [dimension]: Math.max(1, Math.round(value)) });
  };

  const rotation = ((object.rotation ?? 0) + 360) % 360;

  const nudge = (deltaX: number, deltaY: number) => {
    if (object.x === undefined || object.y === undefined) return;
    saveHistory();
    updateObject(object.id, {
      x: object.x + deltaX,
      y: object.y + deltaY,
      points:
        object.type === 'triangle' && object.points
          ? object.points.map((point) => ({ ...point, x: point.x + deltaX, y: point.y + deltaY }))
          : object.points,
    });
  };

  const rotateBy = (delta: number) => {
    saveHistory();
    updateObject(object.id, { rotation: ((object.rotation ?? 0) + delta + 360) % 360 });
  };

  const duplicate = () => {
    saveHistory();
    const copy = duplicateDrawingObject(object, generateId());
    addObject(copy);
    setSelectedObject(copy.id);
  };

  return (
    <SelectionInspectorObjectForm
      object={object}
      isEditable={Boolean(isEditable)}
      isReadOnly={Boolean(isReadOnly)}
      canFill={Boolean(canFill)}
      canResize={Boolean(canResize)}
      rotation={rotation}
      setSelectedObject={setSelectedObject}
      saveHistory={saveHistory}
      updateObject={updateObject}
      nudge={nudge}
      updateText={updateText}
      updateFontSize={updateFontSize}
      resize={resize}
      rotateBy={rotateBy}
      duplicate={duplicate}
    />
  );
}
