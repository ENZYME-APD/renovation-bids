"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { AddLineForm } from "./add-line-form";
import { AddRoomForm } from "./add-room-form";

type Template = { id: string; code: string; name: string; size_label: string; description: string | null };
type Group = { trade: string; partidas: { id: string; code: string; description: string; unit: string; price: number | null }[] };

export function AddButtons({ projectId, versionId, templates, groups, rooms }: { projectId: string; versionId: string; templates: Template[]; groups: Group[]; rooms: string[] }) {
  const [open, setOpen] = useState<"room" | "line" | null>(null);
  const close = () => setOpen(null);
  return (
    <>
      <button className="btn-quiet" onClick={() => setOpen("room")}>+ Add room</button>
      <button className="btn" onClick={() => setOpen("line")}>+ Add line</button>
      <Modal open={open === "room"} onClose={close} title="Add a room">
        <AddRoomForm projectId={projectId} versionId={versionId} templates={templates} onDone={close} />
      </Modal>
      <Modal open={open === "line"} onClose={close} title="Add a line" wide>
        <AddLineForm projectId={projectId} versionId={versionId} groups={groups} rooms={rooms} onDone={close} />
      </Modal>
    </>
  );
}
