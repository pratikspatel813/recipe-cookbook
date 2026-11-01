"use client";

import { useParams } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";

// /u/<id> — anyone's profile. (If the id is yours, it's the same as /profile.)
export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <ProfileView profileId={id} />;
}
