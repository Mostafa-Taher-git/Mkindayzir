"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { SpaceForm } from "@/components/spaces/space-form";
import { ROUTES } from "@/lib/constants";

function NewSpacePage() {
  const router = useRouter();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">New Space</h1>
        <p className="text-muted-foreground mt-1">
          Create a new workspace to organize your boards
        </p>
      </div>
      <SpaceForm onSuccess={() => router.push(ROUTES.SPACES)} />
    </div>
  );
}

export default NewSpacePage;
