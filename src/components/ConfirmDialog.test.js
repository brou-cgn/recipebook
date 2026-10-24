import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('zeigt Titel und Text und ruft onConfirm bzw. onCancel auf', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog title="Liste löschen" message="Wirklich löschen?" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole('alertdialog', { name: 'Liste löschen' })).toBeInTheDocument();
    expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
