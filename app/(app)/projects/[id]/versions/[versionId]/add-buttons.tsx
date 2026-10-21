"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { AddLineForm } from "./add-line-form";
import { AddRoomForm, type Template } from "./add-room-form";

type Group = { trade: string; partidas: { id: string; code: string; description: string; unit: string; price: number | null }[] };

export function AddButtons({ projectId, versionId, templates, groups, rooms, defaultHeight }: { projectId: string; versionId: string; templates: Template[]; groups: Group[]; rooms: string[]; defaultHeight: number }) {
  const [open, setOpen] = useState<"room" | "line" | null>(null);
  const close = () => setOpen(null);
  return (
    <>
      <button className="btn-quiet" onClick={() => setOpen("room")}>+ Add room</button>
      <button className="btn" onClick={() => setOpen("line")}>+ Add line</button>
      <Modal open={open === "room"} onClose={close} title="Add a room">
        <AddRoomForm projectId={projectId} versionId={versionId} templates={templates} defaultHeight={defaultHeight} onDone={close} />
      </Modal>
      <Modal open={open === "line"} onClose={close} title="Add a line" wide>
        <AddLineForm projectId={projectId} versionId={versionId} groups={groups} rooms={rooms} onDone={close} />
      </Modal>
    </>
  );
}
