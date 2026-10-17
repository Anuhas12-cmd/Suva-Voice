import { Share } from 'react-native';
export async function exportReceipt(text: string, reference: string) {
  await Share.share({ title: 'Suva Voice receipt ' + reference, message: text });
}
