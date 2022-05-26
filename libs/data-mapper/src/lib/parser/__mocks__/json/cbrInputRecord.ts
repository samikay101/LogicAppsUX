import type { JsonInputStyle } from '../../jsonToMapDefinitionParser';

export const CBRInputRecordJsonMock: JsonInputStyle = {
  srcSchemaName: 'SrcInputRecord.xsd',
  dstSchemaName: 'CBRInputRecord.xsd',
  mappings: {
    targetNodeKey: '/ns0:CBRInputRecord',
    children: [
      {
        targetNodeKey: '/ns0:CBRInputRecord/@OrderedItem',
        targetValue: {
          value: '/ns0:SrcInputRecord/@Item',
        },
      },
      {
        targetNodeKey: '/ns0:CBRInputRecord/Identity',
        children: [
          {
            targetNodeKey: '/ns0:CBRInputRecord/Identity/@UserID',
            targetValue: {
              value: '/ns0:SrcInputRecord/SrcInputRecord/ID',
            },
          },
          {
            targetNodeKey: '/ns0:CBRInputRecord/Identity/@LastName',
            targetValue: {
              value: '/ns0:SrcInputRecord/SrcInputRecord/LastName',
            },
          },
          {
            targetNodeKey: '/ns0:CBRInputRecord/Identity/@FirstName',
            targetValue: {
              value: '/ns0:SrcInputRecord/SrcInputRecord/FirstName',
            },
          },
          {
            targetNodeKey: '/ns0:CBRInputRecord/Identity/@LastName',
            targetValue: {
              value: '/ns0:SrcInputRecord/SrcInputRecord/LastName',
            },
          },
          {
            targetNodeKey: '/ns0:CBRInputRecord/Identity/@Initial',
            targetValue: {
              value: '/ns0:SrcInputRecord/SrcInputRecord/Initial',
            },
          },
          {
            targetNodeKey: '/ns0:CBRInputRecord/Identity/Address',
            children: [
              {
                targetNodeKey: '/ns0:CBRInputRecord/Customer/Address/AddressLine1',
                targetValue: {
                  value:
                    'concat(/ns0:SrcInputRecord/SrcInputRecord/Address/AddressLine1 , ‘ ’, /ns0:SrcInputRecord/SrcInputRecord/Address/AddressLine2)',
                },
              },
            ],
          },
        ],
      },
    ],
  },
};
