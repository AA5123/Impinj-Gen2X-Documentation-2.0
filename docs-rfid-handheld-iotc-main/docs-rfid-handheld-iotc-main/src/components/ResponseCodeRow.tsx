import React, {type ComponentProps} from 'react';
import useBrokenLinks from '@docusaurus/useBrokenLinks';

/** Register a catalogue row's id with Docusaurus's anchor validator. */
export default function ResponseCodeRow({id, ...props}: ComponentProps<'tr'>): React.JSX.Element {
  const brokenLinks = useBrokenLinks();
  if (id) brokenLinks.collectAnchor(id);
  return <tr id={id} {...props} />;
}
