import { getExistingReferenceKey } from '../../utils/connectors/connections';
import type { ConnectionMapping, ConnectionReference, ConnectionReferences, NodeId, ReferenceKey } from '../../../common/models/workflow';
import type { UpdateConnectionPayload } from '../../actions/bjsworkflow/connections';
import { resetWorkflowState, setStateAfterUndoRedo } from '../global';
import { LogEntryLevel, LoggerService, getUniqueName } from '@microsoft/logic-apps-shared';
import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { UndoRedoPartialRootState } from '../undoRedo/undoRedoTypes';

export interface ConnectionsStoreState {
  connectionsMapping: ConnectionMapping;
  connectionReferences: ConnectionReferences;
}

export const initialConnectionsState: ConnectionsStoreState = {
  connectionsMapping: {},
  connectionReferences: {},
};

type ConnectionReferenceMap = Record<string, ReferenceKey>;

export const connectionSlice = createSlice({
  name: 'connections',
  initialState: initialConnectionsState,
  reducers: {
    initializeConnectionReferences: (state, action: PayloadAction<ConnectionReferences>) => {
      state.connectionReferences = action.payload;
    },
    initializeConnectionsMappings: (state, action: PayloadAction<ConnectionMapping>) => {
      state.connectionsMapping = action.payload;
    },
    changeConnectionMapping: (state, action: PayloadAction<UpdateConnectionPayload>) => {
      const { nodeId, connectionId, connectorId, connectionProperties, connectionRuntimeUrl, authentication } = action.payload;
      const existingReferenceKey = getExistingReferenceKey(state.connectionReferences, action.payload);

      if (existingReferenceKey) {
        state.connectionsMapping[nodeId] = existingReferenceKey;
      } else {
        const { name: newReferenceKey } = getUniqueName(Object.keys(state.connectionReferences), connectorId.split('/').at(-1) as string);
        state.connectionReferences[newReferenceKey] = {
          api: { id: connectorId },
          connection: { id: connectionId },
          connectionName: connectionId.split('/').at(-1) as string,
          connectionProperties,
          connectionRuntimeUrl,
          authentication,
        };
        state.connectionsMapping[nodeId] = newReferenceKey;
      }

      LoggerService().log({
        level: LogEntryLevel.Verbose,
        area: 'Designer:Connection Slice',
        message: action.type,
        args: [action.payload.nodeId, action.payload.connectorId],
      });
    },
    initEmptyConnectionMap: (state, action: PayloadAction<NodeId>) => {
      state.connectionsMapping[action.payload] = null;
    },
    initCopiedConnectionMap: (state, action: PayloadAction<{ connectionReferences: ConnectionReferenceMap }>) => {
      const { connectionReferences } = action.payload;
      Object.entries(connectionReferences).forEach(([nodeId, referenceKey]) => {
        if (referenceKey && state.connectionReferences[referenceKey]) {
          state.connectionsMapping[nodeId] = referenceKey;
        }
      });
    },
    initScopeCopiedConnections: (
      state,
      action: PayloadAction<Record<string, { connectionReference: ConnectionReference; referenceKey: string }>>
    ) => {
      const copiedConnections = action.payload;
      Object.entries(copiedConnections).forEach(([nodeId, { connectionReference, referenceKey }]) => {
        if (referenceKey && state.connectionReferences[referenceKey]) {
          state.connectionsMapping[nodeId] = referenceKey;
        } else {
          state.connectionReferences[referenceKey] = connectionReference;
          state.connectionsMapping[nodeId] = referenceKey;
        }
      });
    },
    removeNodeConnectionData: (state, action: PayloadAction<{ nodeId: NodeId }>) => {
      const { nodeId } = action.payload;
      delete state.connectionsMapping[nodeId];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetWorkflowState, () => initialConnectionsState);
    builder.addCase(setStateAfterUndoRedo, (_, action: PayloadAction<UndoRedoPartialRootState>) => action.payload.connections);
  },
});

// Action creators are generated for each case reducer function
export const {
  initializeConnectionReferences,
  initializeConnectionsMappings,
  changeConnectionMapping,
  initEmptyConnectionMap,
  initCopiedConnectionMap,
  initScopeCopiedConnections,
  removeNodeConnectionData,
} = connectionSlice.actions;

export default connectionSlice.reducer;
