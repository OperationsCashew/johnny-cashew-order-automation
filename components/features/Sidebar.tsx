
import React from 'react';
import { Room, RoomAnalysis, CostSettings, Floor, HouseMetadata, Wall } from '../../types';
import ProjectOverview from './ProjectOverview';
import RoomDetailView from './RoomDetailView';
import WallDetailPanel from '../ui/WallDetailPanel';

interface SidebarProps {
  room: Room | null;
  selectedWall?: { wall: Wall; floorId: string } | null;
  floors: Floor[];
  totalProjectCost: number;
  houseMetadata: HouseMetadata;
  costSettings: CostSettings;
  onUpdateAction: (roomId: string, updates: Partial<RoomAnalysis>) => void;
  onUpdateRoomName?: (roomId: string, newName: string) => void;
  onUpdateMetadata?: (updates: Partial<HouseMetadata>) => void;
  onUpdateWall?: (floorId: string, wallId: string, updates: Partial<Wall>) => void;
  onQuoteOpen?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  room,
  selectedWall,
  floors,
  totalProjectCost,
  houseMetadata,
  costSettings,
  onUpdateAction,
  onUpdateRoomName,
  onUpdateMetadata,
  onUpdateWall,
  onQuoteOpen
}) => {
  // Wall selected — show wall detail panel (takes priority over room)
  if (selectedWall && onUpdateWall) {
    return (
      <WallDetailPanel
        wall={selectedWall.wall}
        floorId={selectedWall.floorId}
        costSettings={costSettings}
        yearBuilt={houseMetadata.yearBuilt}
        onUpdate={onUpdateWall}
      />
    );
  }

  // No room selected — show project overview
  if (!room) {
    return (
      <ProjectOverview
        houseMetadata={houseMetadata}
        floors={floors}
        totalProjectCost={totalProjectCost}
        costSettings={costSettings}
        onUpdateMetadata={onUpdateMetadata}
        onQuoteOpen={onQuoteOpen}
      />
    );
  }

  // Room selected — show room detail
  return (
    <RoomDetailView
      room={room}
      floors={floors}
      costSettings={costSettings}
      houseMetadata={houseMetadata}
      onUpdateAction={onUpdateAction}
      onUpdateRoomName={onUpdateRoomName}
      onUpdateMetadata={onUpdateMetadata}
      onQuoteOpen={onQuoteOpen}
    />
  );
};

export default Sidebar;
